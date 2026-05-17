#!/bin/bash
# Создаёт 5 тестовых игр для padix

API_BASE="${1:-http://localhost:8080}"

echo "🔐 Логин как 1@test.com..."
TOKEN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@test.com","password":"test123"}')

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Ошибка входа"
  exit 1
fi

echo "✅ Вошли"

# Получим текущую дату
DATE=$(date +%Y-%m-%d)

echo ""
echo "🎾 Создаю 5 игр..."

for i in {1..5}; do
  START_HOUR=$((17 + i))
  END_HOUR=$((19 + i))

  TITLE="Игра #$i"
  COURTS=$((1 + (i % 2)))  # Чередуем 1 и 2 корта
  PLAYERS=$((4 + i))  # 5, 6, 7, 8, 9 игроков

  echo -n "  Игра $i: $TITLE ($PLAYERS игроков, $COURTS кортов) ... "

  EVENT_RESPONSE=$(curl -s -X POST "$API_BASE/api/events" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"title\": \"$TITLE\",
      \"date\": \"$DATE\",
      \"startTime\": \"${START_HOUR}:00\",
      \"endTime\": \"${END_HOUR}:00\",
      \"format\": \"AMERICANA\",
      \"pairingMode\": \"ROUND_ROBIN\",
      \"courtsCount\": $COURTS,
      \"courtNames\": $(printf '["Корт %d"' $(seq 1 $COURTS) | sed 's/ /,/g' | sed 's/,/", "Корт /g' | sed 's/"Корт /"Корт /'),
      \"autoRounds\": true,
      \"scoringMode\": \"POINTS\",
      \"pointsPerPlayerPerMatch\": 6
    }")

  EVENT_ID=$(echo "$EVENT_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

  if [ -z "$EVENT_ID" ]; then
    echo "❌ Ошибка"
    continue
  fi

  # Регистрируем первых N игроков
  for j in $(seq 1 $PLAYERS); do
    curl -s -X POST "$API_BASE/api/events/$EVENT_ID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\": \"$j\"}" > /dev/null 2>&1
  done

  echo "✅ ID: $EVENT_ID"
done

echo ""
echo "✨ Готово! Создано 5 игр"
echo "🎯 Перейди на http://localhost:8081/games чтобы увидеть игры"
