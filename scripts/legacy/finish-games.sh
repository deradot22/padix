#!/bin/bash
# Завершает игры со случайными счётами
# Использование: bash scripts/finish-games.sh [API_BASE_URL]

API_BASE="${1:-http://localhost:8080}"

echo "🔐 Логин..."
LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@paddle.local","password":"test123"}')

TOKEN=$(echo "$LOGIN" | sed 's/.*"token":"\([^"]*\)".*/\1/')

if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 100 ]; then
  echo "❌ Ошибка логина"
  exit 1
fi

echo "✅ Вход успешный"
echo ""

# Получаем список всех событий
EVENTS_JSON=$(curl -s -X GET "$API_BASE/api/events/upcoming" \
  -H "Authorization: Bearer $TOKEN")

echo "📋 Получаю все события..."
EVENT_IDS=$(echo "$EVENTS_JSON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

EVENT_COUNT=$(echo "$EVENT_IDS" | wc -l)
echo "Найдено событий: $EVENT_COUNT"
echo ""

# Функция для получения случайного счета (0-24, так как 6*4=24 очка на матч в режиме POINTS)
get_random_score() {
  local max=$1
  local random=$RANDOM
  echo $((random % (max + 1)))
}

# Обработаем каждое событие
EVENT_NUM=0
while IFS= read -r EVENT_ID; do
  [ -z "$EVENT_ID" ] && continue

  EVENT_NUM=$((EVENT_NUM + 1))
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎮 ИГРА $EVENT_NUM: $EVENT_ID"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. Закрываем регистрацию
  echo "  1️⃣ Закрываю регистрацию..."
  CLOSE=$(curl -s -X POST "$API_BASE/api/events/$EVENT_ID/close-registration" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$CLOSE" | grep -q "error"; then
    echo "     ⚠️  Ошибка при закрытии регистрации (может быть уже закрыта)"
  else
    echo "     ✅ Регистрация закрыта"
  fi

  # 2. Запускаем событие
  echo "  2️⃣ Запускаю событие..."
  START=$(curl -s -X POST "$API_BASE/api/events/$EVENT_ID/start" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$START" | grep -q "error"; then
    echo "     ❌ Ошибка при запуске события"
    continue
  else
    echo "     ✅ Событие запущено"
  fi

  # 3. Получаем информацию о матчах
  echo "  3️⃣ Получаю информацию о матчах..."
  EVENT_DETAILS=$(curl -s -X GET "$API_BASE/api/events/$EVENT_ID" \
    -H "Authorization: Bearer $TOKEN")

  # Извлекаем все match ID
  MATCH_IDS=$(echo "$EVENT_DETAILS" | grep -o '"id":"[^"]*"' | grep -v '"roundNumber"' | tail -n +2 | cut -d'"' -f4)

  MATCH_COUNT=$(echo "$MATCH_IDS" | grep -c .)
  echo "     Матчей найдено: $MATCH_COUNT"

  # 4. Вводим счета для каждого матча
  echo "  4️⃣ Ввожу счета для матчей..."
  MATCH_NUM=0
  while IFS= read -r MATCH_ID; do
    [ -z "$MATCH_ID" ] && continue

    MATCH_NUM=$((MATCH_NUM + 1))

    # Генерируем случайные счета (0-24 для каждой команды)
    TEAM_A_POINTS=$(get_random_score 24)
    TEAM_B_POINTS=$(get_random_score 24)

    # Чтобы было интереснее, сумма должна быть примерно 24
    TOTAL=$((TEAM_A_POINTS + TEAM_B_POINTS))
    if [ $TOTAL -gt 24 ]; then
      TEAM_B_POINTS=$((24 - TEAM_A_POINTS))
    fi

    SCORE_RESP=$(curl -s -X POST "$API_BASE/api/events/matches/$MATCH_ID/score" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"teamAPoints":'$TEAM_A_POINTS',"teamBPoints":'$TEAM_B_POINTS'}')

    if echo "$SCORE_RESP" | grep -q "error"; then
      echo "     ❌ Матч $MATCH_NUM: Ошибка ($TEAM_A_POINTS:$TEAM_B_POINTS)"
    else
      echo "     ✅ Матч $MATCH_NUM: $TEAM_A_POINTS:$TEAM_B_POINTS"
    fi
  done <<< "$MATCH_IDS"

  # 5. Завершаем событие
  echo "  5️⃣ Завершаю событие..."
  FINISH=$(curl -s -X POST "$API_BASE/api/events/$EVENT_ID/finish" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$FINISH" | grep -q "error"; then
    echo "     ❌ Ошибка при завершении события"
  else
    echo "     ✅ Событие завершено"
  fi

  echo ""
done <<< "$EVENT_IDS"

echo "✨ ВСЕ ИГРЫ ЗАВЕРШЕНЫ!"
echo ""
echo "📊 Результаты сохранены в системе"
echo "💡 Рейтинги игроков обновлены на основе результатов"
