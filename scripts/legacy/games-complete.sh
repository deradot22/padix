#!/bin/bash
# Создаёт и завершает игры со счётами (упрощённая версия)

API_BASE="${1:-http://localhost:8080}"

echo "════════════════════════════════════════════"
echo "  🎮 СОЗДАНИЕ И ЗАВЕРШЕНИЕ ИГРА СО СЧЁТАМИ"
echo "════════════════════════════════════════════"
echo ""

# Логин
echo "🔐 Логин..."
LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@paddle.local","password":"test123"}')

TOKEN=$(echo "$LOGIN" | sed 's/.*"token":"\([^"]*\)".*/\1/')
echo "✅ Токен получен"
echo ""

# Получить игроков
echo "📋 Загружаю игроков..."
PLAYERS=$(curl -s -X GET "$API_BASE/api/players/rating" \
  -H "Authorization: Bearer $TOKEN")
echo "✅ Игроки загружены"
echo ""

DATE=$(date +%Y-%m-%d)

# Функция для создания и завершения игры
finish_game() {
  local GAME_NUM=$1
  local TITLE=$2
  local PLAYER_START=$3
  local PLAYER_END=$4
  local COURTS=$5

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎮 ИГРА $GAME_NUM: $TITLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Создать событие
  echo "1️⃣ Создаю событие..."
  EVENT=$(curl -s -X POST "$API_BASE/api/events" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"title\":\"$TITLE\",\"date\":\"$DATE\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":$COURTS,\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")

  EVENT_ID=$(echo "$EVENT" | sed 's/.*"id":"\([^"]*\)".*/\1/')

  if [ -z "$EVENT_ID" ] || echo "$EVENT_ID" | grep -q '"'; then
    echo "❌ Ошибка создания события"
    return 1
  fi

  echo "✅ Создано: $EVENT_ID"
  echo ""

  # Регистрировать игроков
  echo "2️⃣ Регистрирую игроков..."
  for i in $(seq $PLAYER_START $PLAYER_END); do
    PLAYER_ID=$(echo "$PLAYERS" | grep -o '"id":"[^"]*"' | sed -n "${i}p" | cut -d'"' -f4)
    [ -n "$PLAYER_ID" ] && curl -s -X POST "$API_BASE/api/events/$EVENT_ID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PLAYER_ID\"}" > /dev/null && echo "✅ Игрок $i"
  done
  echo ""

  # Закрыть регистрацию
  echo "3️⃣ Закрываю регистрацию..."
  curl -s -X POST "$API_BASE/api/events/$EVENT_ID/close-registration" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "✅ Закрыто"
  echo ""

  # Запустить событие
  echo "4️⃣ Запускаю событие..."
  curl -s -X POST "$API_BASE/api/events/$EVENT_ID/start" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "✅ Запущено"
  echo ""

  # Получить матчи
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
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"teamAPoints":'$TEAM_A',"teamBPoints":'$TEAM_B'}' > /dev/null

    echo "✅ Матч $MATCH_NUM: $TEAM_A:$TEAM_B"
  done <<< "$MATCH_IDS"
  echo ""

  # Завершить событие
  echo "6️⃣ Завершаю событие..."
  curl -s -X POST "$API_BASE/api/events/$EVENT_ID/finish" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "✅ Завершено!"
  echo ""
}

# Создать 3 игры
finish_game 1 "Четверка" 1 4 1
finish_game 2 "Восьмёрка" 2 9 2
finish_game 3 "Десятка" 6 15 2

echo "════════════════════════════════════════════"
echo "✨ ВСЕ ИГРЫ СОЗДАНЫ И ЗАВЕРШЕНЫ!"
echo "════════════════════════════════════════════"
