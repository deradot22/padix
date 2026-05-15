#!/bin/bash

API="http://localhost:8080"

# Логин или регистрация
CRED='{"email": "test.organizer2@example.com", "password": "test123456", "name": "Test Organizer 2"}'

LOGIN=$(curl -s -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "$CRED" 2>/dev/null)

TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  LOGIN=$(curl -s -X POST "$API/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "test.organizer2@example.com", "password": "test123456"}' 2>/dev/null)
  TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
fi

echo "Token: ${TOKEN:0:30}..."

# Get first 4 players
PLAYERS=$(curl -s "$API/api/players/rating" 2>/dev/null)
P1=$(echo "$PLAYERS" | sed -n '1s/.*"id":"\([^"]*\)".*/\1/p')
P2=$(echo "$PLAYERS" | sed -n '2s/.*"id":"\([^"]*\)".*/\1/p')
P3=$(echo "$PLAYERS" | sed -n '3s/.*"id":"\([^"]*\)".*/\1/p')
P4=$(echo "$PLAYERS" | sed -n '4s/.*"id":"\([^"]*\)".*/\1/p')

echo "Players: $P1 $P2 $P3 $P4"

# Create event
EVENT=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Test Scores 2026-05-07",
    "date": "2026-05-07",
    "startTime": "18:00:00",
    "endTime": "20:00:00",
    "format": "AMERICANA",
    "pairingMode": "ROUND_ROBIN",
    "courtsCount": 1,
    "autoRounds": true,
    "scoringMode": "POINTS",
    "pointsPerPlayerPerMatch": 6
  }' 2>/dev/null)

EVENT_ID=$(echo "$EVENT" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "Event created: $EVENT_ID"
echo "Full response: $EVENT" | head -200

