#!/usr/bin/env bash
# Smoke-test для проверки что api ↔ bot уведомления не страдают от
# transaction visibility-багов (бот не должен читать устаревшие данные).
#
# Проверяет последовательно:
#   1) Создание игры → bot должен получить notifyEventCreated с актуальным title
#   2) Двойной update title (T1 → T2) → финальный title в БД должен быть T2
#      и в логах не должно быть 500 / FK violations
#   3) Регистрация / отмена → ростер обновляется
#   4) Удаление игры → каскадная отмена без 500
#
# Запуск: bash scripts/smoke-test-bot-sync.sh
# Требования: запущенный compose.dev.yml, dev-юзер 1@test.local с паролем test123456.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"
EMAIL="${EMAIL:-1@test.local}"
PASSWORD="${PASSWORD:-test123456}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

fail() { red "FAIL: $*"; exit 1; }
ok()   { green "OK:   $*"; }
step() { blue  "==> $*"; }

# JSON helpers через python (без jq).
json_field() { python -c "import json,sys; print(json.load(sys.stdin).get('$1',''))"; }
json_str()   { python -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

TEST_STARTED_UNIX="$(date +%s)"

step "Login as $EMAIL"
LOGIN_RES=$(curl -fsS -X POST "$API_BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN_RES" | json_field token)
[ -n "$TOKEN" ] && [ "$TOKEN" != "None" ] || fail "no token"
ok "got token"

step "GET /api/me"
ME=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API_BASE/api/me")
PLAYER_ID=$(echo "$ME" | json_field playerId)
ok "playerId=$PLAYER_ID"

# === 1. Создание ===
TOMORROW=$(date -d 'tomorrow' +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
TS=$(date +%s)
TITLE_INITIAL="smoke-test-$TS"

step "POST /api/events title='$TITLE_INITIAL'"
CREATE_BODY=$(cat <<EOF
{
  "title": "$TITLE_INITIAL",
  "date": "$TOMORROW",
  "startTime": "19:00",
  "endTime": "21:00",
  "pairingMode": "ROUND_ROBIN",
  "courtsCount": 2,
  "roundsPlanned": 6,
  "autoRounds": true,
  "scoringMode": "POINTS",
  "pointsPerPlayerPerMatch": 6,
  "setsPerMatch": 1,
  "gamesPerSet": 6,
  "tiebreakEnabled": true,
  "visibility": "PRIVATE",
  "format": "AMERICANA"
}
EOF
)
EVENT=$(curl -fsS -X POST "$API_BASE/api/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$CREATE_BODY")
EVENT_ID=$(echo "$EVENT" | json_field id)
[ -n "$EVENT_ID" ] && [ "$EVENT_ID" != "None" ] || fail "no event id, body: $EVENT"
ok "created event $EVENT_ID"

# === 2. Двойной update title (главный тест race-condition) ===
T1="${TITLE_INITIAL}-T1"
T2="${TITLE_INITIAL}-T2"

step "PATCH title -> '$T1'"
curl -fsS -o /dev/null -X PATCH "$API_BASE/api/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"$T1\"}"

sleep 0.2

step "PATCH title -> '$T2' (быстро после первого)"
curl -fsS -o /dev/null -X PATCH "$API_BASE/api/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"$T2\"}"

sleep 1.5  # afterCommit hooks

step "GET /api/events/$EVENT_ID → должен быть title='$T2'"
FINAL=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API_BASE/api/events/$EVENT_ID")
# GET возвращает { event: { title: ... }, ... } — title лежит в .event.title.
FINAL_TITLE=$(echo "$FINAL" | python -c "import json,sys;print(json.load(sys.stdin)['event']['title'])")
[ "$FINAL_TITLE" = "$T2" ] || fail "final title is '$FINAL_TITLE', expected '$T2'"
ok "final title in DB = $T2"

# === 3. Регистрация / отмена ===
step "POST /events/$EVENT_ID/register (player=$PLAYER_ID)"
curl -fsS -o /dev/null -X POST "$API_BASE/api/events/$EVENT_ID/register" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"playerId\":\"$PLAYER_ID\"}" || fail "register failed"
sleep 0.5

step "POST /events/$EVENT_ID/cancel"
curl -fsS -o /dev/null -X POST "$API_BASE/api/events/$EVENT_ID/cancel" \
  -H "Authorization: Bearer $TOKEN" || fail "cancel-registration failed"
sleep 0.5

# === 4. Удаление ===
step "DELETE /api/events/$EVENT_ID"
curl -fsS -o /dev/null -X DELETE "$API_BASE/api/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" || fail "delete failed"
ok "event deleted"

# === 5. Самый строгий тест: материализация серии с привязанным фейк-чатом.
# Этот сценарий ВНУТРИ @Transactional (EventSeriesMaterializer.tick) и
# спровоцирует FK violation в event_telegram_post, если afterCommit не работает.
step "Готовлю фейковый telegram_chat и telegram_user_settings"
FAKE_CHAT_ID=$(python -c "import random; print(-random.randint(10**9, 10**12))")
USER_DB_ID=$(docker-compose -f compose.dev.yml exec -T db psql -U padix -d padix -tAc \
  "SELECT id FROM users WHERE email='$EMAIL';")
USER_DB_ID=$(echo "$USER_DB_ID" | tr -d '[:space:]')
[ -n "$USER_DB_ID" ] || fail "user not found in db"

# Включаем telegram-уведомления и привязываем фейковый GROUP-чат.
docker-compose -f compose.dev.yml exec -T db psql -U padix -d padix -q <<SQL >/dev/null
INSERT INTO telegram_user_settings (user_id, enabled, reminder_hours, timezone, pin_announcement)
VALUES ('$USER_DB_ID', true, 2, 'UTC', false)
ON CONFLICT (user_id) DO UPDATE SET enabled=true;

DELETE FROM telegram_chat WHERE user_id='$USER_DB_ID' AND chat_id=$FAKE_CHAT_ID;
INSERT INTO telegram_chat (id, user_id, chat_id, chat_type, title, linked_at,
                           notify_updated, notify_finished, notify_reminder)
VALUES (gen_random_uuid(), '$USER_DB_ID', $FAKE_CHAT_ID, 'GROUP',
        'smoke-test fake', now(), true, true, true);
SQL
ok "fake chat $FAKE_CHAT_ID linked to user"

# Найдём UUID этого чата для targetChatIds.
FAKE_CHAT_UUID=$(docker-compose -f compose.dev.yml exec -T db psql -U padix -d padix -tAc \
  "SELECT id FROM telegram_chat WHERE user_id='$USER_DB_ID' AND chat_id=$FAKE_CHAT_ID;")
FAKE_CHAT_UUID=$(echo "$FAKE_CHAT_UUID" | tr -d '[:space:]')

# Создаём серию: tick() запустится прямо из контроллера в @Transactional,
# материализует игру на завтра (сегодня — в списке days).
TODAY_DOW=$(date +%u)  # 1..7 (Mon..Sun)
DAYS_TO_USE=$(python -c "
dow=int('$TODAY_DOW'); names=['MON','TUE','WED','THU','FRI','SAT','SUN']
print(names[dow-1])  # сегодня
")

step "POST /api/event-series (days=$DAYS_TO_USE, target=$FAKE_CHAT_UUID)"
# materializeHoursBefore=720 (30 дней) гарантирует что игра на ближайший день
# попадёт в окно материализации; materializeAtTime=00:00 — чтоб точно сработал
# триггер «нынешнее время >= materializeAtTime».
SERIES_BODY=$(cat <<EOF
{
  "title": "smoke-series-$TS",
  "daysOfWeek": "$DAYS_TO_USE",
  "startTime": "23:00",
  "endTime": "23:30",
  "courtsCount": 1,
  "materializeHoursBefore": 720,
  "materializeAtTime": "00:00",
  "materializeMode": "HOURS_BEFORE",
  "targetChatIds": ["$FAKE_CHAT_UUID"]
}
EOF
)
SERIES=$(curl -fsS -X POST "$API_BASE/api/event-series" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$SERIES_BODY")
SERIES_ID=$(echo "$SERIES" | json_field id)
ok "series $SERIES_ID created"

# Ждём чтобы afterCommit + бот ответили.
sleep 3

step "Проверяю event_telegram_post (требует bot dry-run, см. APP_TELEGRAM_DRY_RUN)"
# Если запустить тест с APP_TELEGRAM_DRY_RUN=true, bot не делает реального
# вызова в Telegram, sendMessage возвращает успех — и тогда INSERT
# event_telegram_post происходит. Если afterCommit СЛОМАН → INSERT падает с
# FK violation. Если работает — INSERT проходит, запись появляется.
DRY_RUN_NOW=$(docker-compose -f compose.dev.yml exec -T bot sh -c 'echo $APP_TELEGRAM_DRY_RUN' | tr -d '[:space:]')
if [ "$DRY_RUN_NOW" = "true" ]; then
  POST_COUNT=$(docker-compose -f compose.dev.yml exec -T db psql -U padix -d padix -tAc \
    "SELECT count(*) FROM event_telegram_post p
     JOIN events e ON e.id = p.event_id
     WHERE e.series_id='$SERIES_ID';" | tr -d '[:space:]')
  [ "$POST_COUNT" -gt 0 ] \
    || fail "event_telegram_post НЕ создалась (count=$POST_COUNT) — FK violation? afterCommit не работает!"
  ok "event_telegram_post создалась ($POST_COUNT записей)"
else
  echo "  (skip: bot не в dry-run режиме; см. APP_TELEGRAM_DRY_RUN=true в .env для полной проверки)"
fi

step "Чистка: серия + materialized events + telegram_chat"
docker-compose -f compose.dev.yml exec -T db psql -U padix -d padix -q <<SQL >/dev/null
DELETE FROM event_invites WHERE event_id IN (SELECT id FROM events WHERE series_id='$SERIES_ID');
DELETE FROM events WHERE series_id='$SERIES_ID';
DELETE FROM event_series WHERE id='$SERIES_ID';
DELETE FROM telegram_chat WHERE chat_id=$FAKE_CHAT_ID;
SQL
ok "cleanup done"

# === 5. Логи ===
sleep 2

step "Грепаю логи api/bot за время теста"

SUSPICIOUS='violates foreign key constraint|notify/event-.*failed|bot.*HTTP 500|Servlet\.service\(\).*threw exception|DataIntegrityViolationException|Failed to send.*cancellation|Failed to notify bot'

# docker-compose --since принимает относительное время типа 2m, либо абсолютное
# RFC3339. Берём логи за последние 5 минут — достаточно для полного теста.
API_OUT=$(docker-compose -f compose.dev.yml logs --since 5m api 2>&1 | grep -E "$SUSPICIOUS" || true)
BOT_OUT=$(docker-compose -f compose.dev.yml logs --since 5m bot 2>&1 | grep -E "$SUSPICIOUS" || true)

API_HITS=$(echo "$API_OUT" | sed '/^$/d' | wc -l)
BOT_HITS=$(echo "$BOT_OUT" | sed '/^$/d' | wc -l)

echo
echo "Suspicious lines in api logs: $API_HITS"
echo "Suspicious lines in bot logs: $BOT_HITS"

if [ "$API_HITS" -gt 0 ] || [ "$BOT_HITS" -gt 0 ]; then
  red "─── api suspicious ───"
  echo "$API_OUT"
  red "─── bot suspicious ───"
  echo "$BOT_OUT"
  fail "Подозрительные строки в логах — см. выше"
fi

ok "no errors in logs during smoke-test"
green "===== ALL OK ====="
