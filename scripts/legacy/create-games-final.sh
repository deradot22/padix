#!/bin/bash
# Создаёт игры со счётами (финальная версия)

API_BASE="${1:-http://localhost:8080}"

create_game() {
  local NUM=$1
  local TITLE=$2
  local PLAYER_START=$3
  local PLAYER_END=$4
  local COURTS=$5

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎮 ИГРА $NUM: $TITLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Получить свежий токен
  TOKEN=$(curl -s -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"1@paddle.local","password":"test123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

  # Получить игроков
  PLAYERS=$(curl -s -X GET "$API_BASE/api/players/rating" \
    -H "Authorization: Bearer $TOKEN")

  DATE=$(date +%Y-%m-%d)

  # 1. Создать событие
  echo "1️⃣ Создаю событие..."
  EVENT=$(curl -s -X POST "$API_BASE/api/events" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"title\":\"$TITLE\",\"date\":\"$DATE\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":$COURTS,\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")

  EVENT_ID=$(echo "$EVENT" | sed 's/.*"id":"\([^"]*\)".*/\1/')

  if [ -z "$EVENT_ID" ] || echo "$EVENT_ID" | grep -q '{'; then
    echo "❌ Ошибка создания"
    return 1
  fi

  echo "✅ Создано: $EVENT_ID"

  # 2. Регистрировать игроков
  echo "2️⃣ Регистрирую игроков..."
  for i in $(seq $PLAYER_START $PLAYER_END); do
    PLAYER_ID=$(echo "$PLAYERS" | grep -o '"id":"[^"]*"' | sed -n "${i}p" | cut -d'"' -f4)
    if [ -n "$PLAYER_ID" ]; then
      curl -s -X POST "$API_BASE/api/events/$EVENT_ID/register" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $TOKEN" \
        -d "{\"playerId\":\"$PLAYER_ID\"}" > /dev/null
      echo "✅ Игрок $i"
    fi
  done

  # 3. Закрыть регистрацию
  echo "3️⃣ Закрываю регистрацию..."
  curl -s -X POST "$API_BASE/api/events/$EVENT_ID/close-registration" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "✅"

  # 4. Запустить событие
  echo "4️⃣ Запускаю событие..."
  curl -s -X POST "$API_BASE/api/events/$EVENT_ID/start" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "✅"

  # 5. Получить матчи
  echo "5️⃣ Ввожу очки..."
  EVENT_DATA=$(curl -s -X GET "$API_BASE/api/events/$EVENT_ID" \
    -H "Authorization: Bearer $TOKEN")

  MATCH_IDS=$(echo "$EVENT_DATA" | grep -o '"id":"[^"]*"' | tail -n +2 | cut -d'"' -f4)

  MATCH_NUM=0
  while IFS= read -r MATCH_ID; do
    [ -z "$MATCH_ID" ] && continue
    MATCH_NUM=$((MATCH_NUM + 1))

    TOTAL=24
    TEAM_A=$((RANDOM % (TOTAL + 1)))
    TEAM_B=$((TOTAL - TEAM_A))

    curl -s -X POST "$API_BASE/api/events/matches/$MATCH_ID/score" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"teamAPoints\":$TEAM_A,\"teamBPoints\":$TEAM_B}" > /dev/null

    echo "✅ Матч $MATCH_NUM: $TEAM_A:$TEAM_B"
  done <<< "$MATCH_IDS"

  # 6. Завершить событие
  echo "6️⃣ Завершаю событие..."
  curl -s -X POST "$API_BASE/api/events/$EVENT_ID/finish" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "✅ Завершено!"
  echo ""
}

echo "════════════════════════════════════════════"
echo "  🎮 СОЗДАНИЕ ИГРА СО СЧЁТАМИ"
echo "════════════════════════════════════════════"
echo ""

create_game 1 "Четверка" 1 4 1
create_game 2 "Восьмёрка" 2 9 2
create_game 3 "Десятка" 6 15 2

echo "════════════════════════════════════════════"
echo "✨ ВСЕ ИГРЫ ГОТОВЫ!"
echo "════════════════════════════════════════════"
