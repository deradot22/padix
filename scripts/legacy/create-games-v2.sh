#!/bin/bash
# Создаёт 3 тестовые игры с существующими игроками
# Использование: bash scripts/create-games-v2.sh [API_BASE_URL]

API_BASE="${1:-http://localhost:8080}"
CREATOR_EMAIL="1@paddle.local"
CREATOR_PASS="test123"

echo "🔐 Логин как создатель игр ($CREATOR_EMAIL)..."
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

# Получаем список всех игроков
echo "📋 Получаю список всех игроков..."
PLAYERS_JSON=$(curl -s -X GET "$API_BASE/api/players/rating" \
  -H "Authorization: Bearer $TOKEN")

DATE=$(date +%Y-%m-%d)

echo ""
echo "🎮 Создаю 3 игры..."

# ============= ИГРА 1 =============
echo ""
echo "=== ИГРА 1: Четверка (4 игрока, 1 корт) ==="

EVENT1=$(curl -s -X POST "$API_BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Тестовая игра 1 - Четверка","date":"'$DATE'","startTime":"18:00","endTime":"20:00","format":"AMERICANA","pairingMode":"ROUND_ROBIN","courtsCount":1,"courtNames":["Корт 1"],"autoRounds":true,"scoringMode":"POINTS","pointsPerPlayerPerMatch":6}')

EVENT1_ID=$(echo "$EVENT1" | sed 's/.*"id":"\([^"]*\)".*/\1/')

if [ -z "$EVENT1_ID" ] || [ ${#EVENT1_ID} -lt 10 ]; then
  echo "❌ Ошибка создания игры 1"
  echo "Ответ: $EVENT1"
  exit 1
fi

echo "✅ Создана: $EVENT1_ID"

# Регистрируем игроков 1-4
for i in 1 2 3 4; do
  PLAYER_ID=$(echo "$PLAYERS_JSON" | grep -o '"id":"[^"]*"' | sed -n "${i}p" | cut -d'"' -f4)
  if [ -n "$PLAYER_ID" ]; then
    curl -s -o /dev/null -X POST "$API_BASE/api/events/$EVENT1_ID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"playerId":"'$PLAYER_ID'"}'
    echo "  ✅ Игрок $i зарегистрирован"
  fi
done

# ============= ИГРА 2 =============
echo ""
echo "=== ИГРА 2: Восьмёрка (8 игроков, 2 корта) ==="

EVENT2=$(curl -s -X POST "$API_BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Тестовая игра 2 - Восьмёрка","date":"'$DATE'","startTime":"19:00","endTime":"21:00","format":"AMERICANA","pairingMode":"ROUND_ROBIN","courtsCount":2,"courtNames":["Корт A","Корт B"],"autoRounds":true,"scoringMode":"POINTS","pointsPerPlayerPerMatch":6}')

EVENT2_ID=$(echo "$EVENT2" | sed 's/.*"id":"\([^"]*\)".*/\1/')

if [ -z "$EVENT2_ID" ] || [ ${#EVENT2_ID} -lt 10 ]; then
  echo "❌ Ошибка создания игры 2"
  exit 1
fi

echo "✅ Создана: $EVENT2_ID"

# Регистрируем игроков 2-9
for i in $(seq 2 9); do
  PLAYER_ID=$(echo "$PLAYERS_JSON" | grep -o '"id":"[^"]*"' | sed -n "${i}p" | cut -d'"' -f4)
  if [ -n "$PLAYER_ID" ]; then
    curl -s -o /dev/null -X POST "$API_BASE/api/events/$EVENT2_ID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"playerId":"'$PLAYER_ID'"}'
    echo "  ✅ Игрок $i зарегистрирован"
  fi
done

# ============= ИГРА 3 =============
echo ""
echo "=== ИГРА 3: Десятка (10 игроков, 2 корта) ==="

EVENT3=$(curl -s -X POST "$API_BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Тестовая игра 3 - Десятка","date":"'$DATE'","startTime":"19:30","endTime":"21:30","format":"AMERICANA","pairingMode":"ROUND_ROBIN","courtsCount":2,"courtNames":["Корт 1","Корт 2"],"autoRounds":true,"scoringMode":"POINTS","pointsPerPlayerPerMatch":6}')

EVENT3_ID=$(echo "$EVENT3" | sed 's/.*"id":"\([^"]*\)".*/\1/')

if [ -z "$EVENT3_ID" ] || [ ${#EVENT3_ID} -lt 10 ]; then
  echo "❌ Ошибка создания игры 3"
  exit 1
fi

echo "✅ Создана: $EVENT3_ID"

# Регистрируем игроков 6-15
for i in $(seq 6 15); do
  PLAYER_ID=$(echo "$PLAYERS_JSON" | grep -o '"id":"[^"]*"' | sed -n "${i}p" | cut -d'"' -f4)
  if [ -n "$PLAYER_ID" ]; then
    curl -s -o /dev/null -X POST "$API_BASE/api/events/$EVENT3_ID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"playerId":"'$PLAYER_ID'"}'
    echo "  ✅ Игрок $i зарегистрирован"
  fi
done

echo ""
echo "✨ ВСЕ ИГРЫ СОЗДАНЫ!"
echo ""
echo "📊 РЕЗУЛЬТАТЫ:"
echo ""
echo "🎮 ИГРА 1: Четверка"
echo "   ID:     $EVENT1_ID"
echo "   URL:    http://localhost:8081/events/$EVENT1_ID"
echo "   Игроки: 1-4 (4 человека)"
echo "   Статус: OPEN_FOR_REGISTRATION"
echo ""
echo "🎮 ИГРА 2: Восьмёрка"
echo "   ID:     $EVENT2_ID"
echo "   URL:    http://localhost:8081/events/$EVENT2_ID"
echo "   Игроки: 2-9 (8 человек)"
echo "   Статус: OPEN_FOR_REGISTRATION"
echo ""
echo "🎮 ИГРА 3: Десятка"
echo "   ID:     $EVENT3_ID"
echo "   URL:    http://localhost:8081/events/$EVENT3_ID"
echo "   Игроки: 6-15 (10 человек)"
echo "   Статус: OPEN_FOR_REGISTRATION"
