#!/bin/bash
# Создаёт игры со счётами напрямую в БД (надёжный способ)

set -e

# Параметры
GAME_DATA=(
  "1|Четверка|1|4|1"
  "2|Восьмёрка|2|9|2"
  "3|Десятка|6|15|2"
)

echo "════════════════════════════════════════════════════════════"
echo "  🎮 СОЗДАНИЕ ИГРА СО СЧЁТАМИ ЧЕРЕЗ БД"
echo "════════════════════════════════════════════════════════════"
echo ""

# Получаем список игроков из API
echo "📋 Загружаю список игроков..."
TOKEN=$(curl -s -X POST "http://localhost:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@paddle.local","password":"test123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

PLAYERS_JSON=$(curl -s -X GET "http://localhost:8080/api/players/rating" \
  -H "Authorization: Bearer $TOKEN")

PLAYER_IDS=($(echo "$PLAYERS_JSON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4))
echo "✅ Загружено ${#PLAYER_IDS[@]} игроков"
echo ""

# Удаляем старые неполные события
echo "🗑️ Очищаю неполные события..."
docker exec padix-db-1 psql -U padix -d padix << 'EOF' > /dev/null
DELETE FROM match_draft_scores WHERE match_id IN (SELECT id FROM matches WHERE status != 'FINISHED');
DELETE FROM match_set_scores WHERE match_id IN (SELECT id FROM matches WHERE status != 'FINISHED');
DELETE FROM matches WHERE status != 'FINISHED';
DELETE FROM rounds WHERE event_id NOT IN (SELECT id FROM events WHERE status = 'FINISHED');
DELETE FROM event_courts WHERE event_id NOT IN (SELECT id FROM events WHERE status = 'FINISHED');
DELETE FROM registrations WHERE event_id NOT IN (SELECT id FROM events WHERE status = 'FINISHED');
DELETE FROM events WHERE status != 'FINISHED';
EOF
echo "✅"
echo ""

# Функция для создания игры
create_game() {
  local GAME_NUM=$1
  local GAME_TITLE=$2
  local PLAYER_START=$3
  local PLAYER_END=$4
  local COURTS=$5

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎮 ИГРА $GAME_NUM: $GAME_TITLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # 1️⃣ Создаём событие в БД
  echo "  1️⃣ Создаю событие..."
  EVENT_ID=$(docker exec padix-db-1 psql -U padix -d padix -q -t -c "
    INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode)
    VALUES (gen_random_uuid(), '$GAME_TITLE', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'FINISHED', $COURTS, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN')
    RETURNING id;
  " | xargs)

  echo "     ✅ Создано: $EVENT_ID"
  echo ""

  # 2️⃣ Добавляем корты
  echo "  2️⃣ Добавляю корты..."
  for i in $(seq 1 $COURTS); do
    docker exec padix-db-1 psql -U padix -d padix -c "
      INSERT INTO event_courts (id, event_id, court_number, name)
      VALUES (gen_random_uuid(), '$EVENT_ID', $i, 'Корт $i');
    " > /dev/null
  done
  echo "     ✅"
  echo ""

  # 3️⃣ Регистрируем игроков
  echo "  3️⃣ Регистрирую игроков ($PLAYER_START-$PLAYER_END)..."
  for i in $(seq $PLAYER_START $PLAYER_END); do
    if [ $i -lt ${#PLAYER_IDS[@]} ]; then
      PLAYER_ID="${PLAYER_IDS[$i]}"
      docker exec padix-db-1 psql -U padix -d padix -c "
        INSERT INTO registrations (id, event_id, player_id, status, created_at)
        VALUES (gen_random_uuid(), '$EVENT_ID', '$PLAYER_ID', 'REGISTERED', CURRENT_TIMESTAMP);
      " > /dev/null
      echo "     ✅ Игрок $i"
    fi
  done
  echo ""

  # 4️⃣ Создаём раунд
  echo "  4️⃣ Создаю раунд..."
  ROUND_ID=$(docker exec padix-db-1 psql -U padix -d padix -q -t -c "
    INSERT INTO rounds (id, event_id, round_number)
    VALUES (gen_random_uuid(), '$EVENT_ID', 1)
    RETURNING id;
  " | xargs)
  echo "     ✅"
  echo ""

  # 5️⃣ Создаём матчи и добавляем очки
  echo "  5️⃣ Создаю матчи и добавляю очки..."

  # Простая логика для формирования пар (в зависимости от количества игроков)
  PLAYERS_IN_GAME=$((PLAYER_END - PLAYER_START + 1))
  MATCHES_COUNT=$((PLAYERS_IN_GAME / 4))

  if [ $MATCHES_COUNT -lt 1 ]; then
    MATCHES_COUNT=1
  fi

  COURT_NUM=1
  MATCH_NUM=0

  for i in $(seq 0 $((MATCHES_COUNT - 1))); do
    MATCH_NUM=$((MATCH_NUM + 1))

    # Берём 4 игроков для матча (в реальности это должна быть правильная парировка)
    OFFSET=$((PLAYER_START + (i * 4)))
    P1_IDX=$((OFFSET))
    P2_IDX=$((OFFSET + 1))
    P3_IDX=$((OFFSET + 2))
    P4_IDX=$((OFFSET + 3))

    if [ $P4_IDX -ge ${#PLAYER_IDS[@]} ]; then
      P4_IDX=$((${#PLAYER_IDS[@]} - 1))
    fi
    if [ $P3_IDX -ge ${#PLAYER_IDS[@]} ]; then
      P3_IDX=$((${#PLAYER_IDS[@]} - 1))
    fi
    if [ $P2_IDX -ge ${#PLAYER_IDS[@]} ]; then
      P2_IDX=$((${#PLAYER_IDS[@]} - 1))
    fi
    if [ $P1_IDX -ge ${#PLAYER_IDS[@]} ]; then
      P1_IDX=$((${#PLAYER_IDS[@]} - 1))
    fi

    TEAM_A_P1="${PLAYER_IDS[$P1_IDX]}"
    TEAM_A_P2="${PLAYER_IDS[$P2_IDX]}"
    TEAM_B_P1="${PLAYER_IDS[$P3_IDX]}"
    TEAM_B_P2="${PLAYER_IDS[$P4_IDX]}"

    # Создаём матч
    MATCH_ID=$(docker exec padix-db-1 psql -U padix -d padix -q -t -c "
      INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
      VALUES (gen_random_uuid(), '$ROUND_ID', $COURT_NUM, '$TEAM_A_P1', '$TEAM_A_P2', '$TEAM_B_P1', '$TEAM_B_P2', 'FINISHED')
      RETURNING id;
    " | xargs)

    # Генерируем случайные очки (от 0 до 24, в сумме 24)
    TOTAL=24
    TEAM_A=$((RANDOM % (TOTAL + 1)))
    TEAM_B=$((TOTAL - TEAM_A))

    # Добавляем очки
    docker exec padix-db-1 psql -U padix -d padix -c "
      INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points)
      VALUES (gen_random_uuid(), '$MATCH_ID', $TEAM_A, $TEAM_B);
    " > /dev/null

    echo "     ✅ Матч $MATCH_NUM: $TEAM_A:$TEAM_B"

    # Переключаем корт
    if [ $COURTS -gt 1 ]; then
      COURT_NUM=$((COURT_NUM % COURTS + 1))
    fi
  done
  echo ""

  # 6️⃣ Обновляем games_played для игроков
  echo "  6️⃣ Обновляю games_played..."
  docker exec padix-db-1 psql -U padix -d padix -c "
    UPDATE players p
    SET games_played = games_played + 1
    WHERE id IN (
      SELECT DISTINCT team_a_p1 FROM matches WHERE round_id = '$ROUND_ID'
      UNION
      SELECT DISTINCT team_a_p2 FROM matches WHERE round_id = '$ROUND_ID'
      UNION
      SELECT DISTINCT team_b_p1 FROM matches WHERE round_id = '$ROUND_ID'
      UNION
      SELECT DISTINCT team_b_p2 FROM matches WHERE round_id = '$ROUND_ID'
    );
  " > /dev/null
  echo "     ✅"
  echo ""
}

# Создаём все 3 игры
for GAME_DEF in "${GAME_DATA[@]}"; do
  IFS='|' read GAME_NUM GAME_TITLE PLAYER_START PLAYER_END COURTS <<< "$GAME_DEF"
  create_game "$GAME_NUM" "$GAME_TITLE" "$PLAYER_START" "$PLAYER_END" "$COURTS"
done

echo "════════════════════════════════════════════════════════════"
echo "✨ ВСЕ ИГРЫ СОЗДАНЫ И ЗАВЕРШЕНЫ!"
echo "════════════════════════════════════════════════════════════"
echo ""

# Проверяем результаты
echo "📊 Проверка рейтингов..."
TOKEN=$(curl -s -X POST "http://localhost:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@paddle.local","password":"test123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

curl -s -X GET "http://localhost:8080/api/players/rating" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"name":"[^"]*","rating":[0-9]*,"ntrp":"[^"]*","gamesPlayed":[0-9]*' | head -5 | while read line; do
  echo "  $line"
done

echo ""
echo "✅ Готово!"
