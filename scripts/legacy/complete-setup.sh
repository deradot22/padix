#!/bin/bash
# Полная настройка: создаёт пользователей, игры и результаты

API="http://localhost:8080"
TODAY=$(date +%Y-%m-%d)

echo "=========================================="
echo "🚀 Полная настройка Padix"
echo "=========================================="

# 1. Создаём пользователей
echo ""
echo "1️⃣  Создаю 10 пользователей..."
ADMIN_TOKEN=$(curl -s -X POST "$API/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin228","password":"admin228"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Не удалось получить админ токен"
  exit 1
fi

for i in {1..10}; do
  EMAIL="$i@test.com"
  PASS="test123"
  NAME="Игрок $i"
  RATING=$((1000 + i * 100))

  curl -s -X POST "$API/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"$NAME\",\"rating\":$RATING,\"surveyCompleted\":true,\"calibrationEventsRemaining\":0,\"gender\":\"M\"}" > /dev/null 2>&1

  echo "  ✅ $EMAIL"
done

# 2. Логинимся как первый пользователь
echo ""
echo "2️⃣  Логинюсь как 1@test.com..."
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@test.com","password":"test123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Не удалось войти"
  exit 1
fi
echo "✅ Вошли"

# 3. Создаём 5 игр
echo ""
echo "3️⃣  Создаю 5 игр..."
EVENT_IDS=""

for i in {1..5}; do
  START_HOUR=$((17 + i))
  END_HOUR=$((19 + i))
  COURTS=$((1 + (i % 2)))

  COURTS_JSON="["
  for c in $(seq 1 $COURTS); do
    if [ $c -gt 1 ]; then COURTS_JSON="$COURTS_JSON,"; fi
    COURTS_JSON="$COURTS_JSON\"Корт $c\""
  done
  COURTS_JSON="$COURTS_JSON]"

  RESP=$(curl -s -X POST "$API/api/events" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"title\": \"Игра #$i\",
      \"date\": \"$TODAY\",
      \"startTime\": \"${START_HOUR}:00\",
      \"endTime\": \"${END_HOUR}:00\",
      \"format\": \"AMERICANA\",
      \"pairingMode\": \"ROUND_ROBIN\",
      \"courtsCount\": $COURTS,
      \"courtNames\": $COURTS_JSON,
      \"autoRounds\": true,
      \"scoringMode\": \"POINTS\",
      \"pointsPerPlayerPerMatch\": 6
    }")

  EID=$(echo "$RESP" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
  if [ ! -z "$EID" ]; then
    EVENT_IDS="$EVENT_IDS $EID"
    echo "  ✅ Игра #$i: $EID"
  fi
done

# 4. Завершаем каждую игру
echo ""
echo "4️⃣  Завершаю игры с результатами..."

for EID in $EVENT_IDS; do
  # Регистрируем игроков
  for PID in {1..5}; do
    curl -s -X POST "$API/api/events/$EID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\": \"$PID\"}" > /dev/null 2>&1
  done

  # Начинаем игру
  curl -s -X POST "$API/api/events/$EID/start" \
    -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1

  # Получим матчи
  sleep 1
  EVENT=$(curl -s "$API/api/events/$EID" \
    -H "Authorization: Bearer $TOKEN")

  # Ищем matchId в события
  MATCH_IDS=$(echo "$EVENT" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | tail -n +2)

  COUNT=0
  for MID in $MATCH_IDS; do
    COUNT=$((COUNT + 1))
    if [ $COUNT -gt 4 ]; then break; fi

    curl -s -X POST "$API/api/events/matches/$MID/score" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\": {\"teamAPoints\": 21, \"teamBPoints\": 15}}" > /dev/null 2>&1
  done

  # Завершаем игру
  curl -s -X POST "$API/api/events/$EID/finish" \
    -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1

  echo "  ✅ Игра завершена ($COUNT матчей)"
done

echo ""
echo "=========================================="
echo "✨ Готово!"
echo "=========================================="
echo ""
echo "🎯 Теперь откройте http://localhost:8081"
echo "📝 Логин: 1@test.com"
echo "🔑 Пароль: test123"
echo ""
echo "Вы увидите 5 завершённых игр! 🎾"
