#!/bin/bash
API="http://localhost:8080"
TODAY=$(date +%Y-%m-%d)

# Login as first user
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@test.com","password":"test123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Logged in as user1@test.com"
echo ""
echo "Creating 5 games..."

EVENT_IDS=""

for i in {1..5}; do
  START_HOUR=$((17 + i))
  END_HOUR=$((19 + i))
  COURTS=$((1 + (i % 2)))

  COURTS_JSON="["
  for c in $(seq 1 $COURTS); do
    if [ $c -gt 1 ]; then COURTS_JSON="$COURTS_JSON,"; fi
    COURTS_JSON="$COURTS_JSON\"Court $c\""
  done
  COURTS_JSON="$COURTS_JSON]"

  RESP=$(curl -s -X POST "$API/api/events" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"title\": \"Game #$i\",
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
    echo "  ✅ Game #$i: $EID"
  fi
done

echo ""
echo "Completing games with results..."

for EID in $EVENT_IDS; do
  # Register players 1-5
  for PID in {1..5}; do
    curl -s -X POST "$API/api/events/$EID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\": \"$PID\"}" > /dev/null 2>&1
  done

  # Start game
  curl -s -X POST "$API/api/events/$EID/start" \
    -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1

  # Get matches
  sleep 1
  EVENT=$(curl -s "$API/api/events/$EID" \
    -H "Authorization: Bearer $TOKEN")

  # Parse match IDs
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

  # Finish game
  curl -s -X POST "$API/api/events/$EID/finish" \
    -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1

  echo "  ✅ Game finished ($COUNT matches)"
done

echo ""
echo "✨ Setup complete! 5 games created and finished."
echo "Login: user1@test.com / test123"
