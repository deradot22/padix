#!/bin/bash

API_URL="http://localhost:8080"

# Получить всех игроков
echo "Getting players..."
RESPONSE=$(curl -s "$API_URL/api/players/rating")
echo "Response: $RESPONSE" | head -100

# Попробуем создать игру с жестко заданными ID игроков
EVENT_RESPONSE=$(curl -s -X POST "$API_URL/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Event with Scores",
    "date": "2026-05-06",
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

echo "Event created: $EVENT_RESPONSE"
