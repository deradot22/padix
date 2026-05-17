#!/bin/bash

API="http://localhost:8080"

# 1. Создать пользователя и получить токен
echo "Creating test user..."
LOGIN_RESPONSE=$(curl -s -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.organizer@example.com",
    "password": "test123456",
    "name": "Test Organizer"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Got token: ${TOKEN:0:20}..."

if [ -z "$TOKEN" ]; then
  echo "Failed to get token. Trying to login..."
  LOGIN_RESPONSE=$(curl -s -X POST "$API/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test.organizer@example.com",
      "password": "test123456"
    }')
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  echo "Failed to authenticate"
  exit 1
fi

# 2. Получить список игроков (первых 6)
echo "Getting players..."
PLAYER1=$(curl -s "$API/api/players/rating" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
PLAYER2=$(curl -s "$API/api/players/rating" | grep -o '"id":"[^"]*' | head -2 | tail -1 | cut -d'"' -f4)
PLAYER3=$(curl -s "$API/api/players/rating" | grep -o '"id":"[^"]*' | head -3 | tail -1 | cut -d'"' -f4)
PLAYER4=$(curl -s "$API/api/players/rating" | grep -o '"id":"[^"]*' | head -4 | tail -1 | cut -d'"' -f4)

echo "Using players: $PLAYER1, $PLAYER2, $PLAYER3, $PLAYER4"

# 3. Создать событие
echo "Creating event..."
EVENT_RESPONSE=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Test Event with Scores",
    "date": "2026-05-07",
    "startTime": "18:00:00",
    "endTime": "20:00:00",
    "format": "AMERICANA",
    "pairingMode": "ROUND_ROBIN",
    "courtsCount": 1,
    "autoRounds": true,
    "roundsPlanned": 1,
    "scoringMode": "POINTS",
    "pointsPerPlayerPerMatch": 6
  }')

EVENT_ID=$(echo "$EVENT_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Created event: $EVENT_ID"

# 4. Зарегистрировать игроков
echo "Registering players..."
for PLAYER in $PLAYER1 $PLAYER2 $PLAYER3 $PLAYER4; do
  curl -s -X POST "$API/api/events/$EVENT_ID/register" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"playerId\": \"$PLAYER\"}" > /dev/null
  echo "Registered $PLAYER"
done

# 5. Закрыть регистрацию
curl -s -X POST "$API/api/events/$EVENT_ID/close-registration" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "Registration closed"

# 6. Стартовать событие
curl -s -X POST "$API/api/events/$EVENT_ID/start" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "Event started"

# 7. Получить матчи и проставить очки
echo "Getting matches..."
sleep 1
MATCHES=$(curl -s "$API/api/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[a-f0-9\-]*' | grep -v '"eventId"' | cut -d'"' -f4 | head -2)

echo "Setting scores..."
for MATCH_ID in $MATCHES; do
  TEAM_A=$((RANDOM % 25))
  TEAM_B=$((RANDOM % 25))
  
  curl -s -X POST "$API/api/events/matches/$MATCH_ID/score" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"teamAPoints\": $TEAM_A, \"teamBPoints\": $TEAM_B}" > /dev/null
  echo "Set score for match $MATCH_ID: $TEAM_A:$TEAM_B"
  sleep 0.5
done

# 8. Завершить событие
echo "Finishing event..."
curl -s -X POST "$API/api/events/$EVENT_ID/finish" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "Event finished!"
echo "Event ID: $EVENT_ID"

