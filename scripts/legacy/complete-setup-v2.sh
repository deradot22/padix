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

# Get player IDs
echo "Getting player IDs..."
PLAYER_IDS=$(curl -s "$API/api/players/rating?limit=20" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

PLAYERS=()
COUNT=0
for PID in $PLAYER_IDS; do
  PLAYERS+=("$PID")
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge 5 ]; then break; fi
done

echo "Found ${#PLAYERS[@]} players"
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
  echo ""
  echo "Processing game: $EID"
  
  # Register players using their UUIDs
  for PID in "${PLAYERS[@]}"; do
    RESULT=$(curl -s -X POST "$API/api/events/$EID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\": \"$PID\"}")
  done
  echo "  ✅ Registered ${#PLAYERS[@]} players"

  # Start game
  START_RESULT=$(curl -s -X POST "$API/api/events/$EID/start" \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$START_RESULT" | grep -q "error"; then
    echo "  ⚠️  Error starting game: $(echo $START_RESULT | head -c 100)"
    continue
  fi
  
  echo "  ✅ Game started"

  # Get matches - wait a moment for the pairings to be created
  sleep 2
  EVENT=$(curl -s "$API/api/events/$EID" \
    -H "Authorization: Bearer $TOKEN")

  # Extract match IDs from rounds
  MATCH_IDS=$(echo "$EVENT" | grep -o '"id":"[^"]*' | grep -v "^$EID" | cut -d'"' -f4)

  COUNT=0
  for MID in $MATCH_IDS; do
    COUNT=$((COUNT + 1))
    if [ $COUNT -gt 10 ]; then break; fi

    curl -s -X POST "$API/api/events/matches/$MID/score" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\": {\"teamAPoints\": 21, \"teamBPoints\": 15}}" > /dev/null 2>&1
  done

  echo "  ✅ Added results for $COUNT matches"

  # Finish game
  FINISH=$(curl -s -X POST "$API/api/events/$EID/finish" \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$FINISH" | grep -q "error"; then
    echo "  ⚠️  Error finishing: $(echo $FINISH | head -c 50)"
  else
    echo "  ✅ Game finished"
  fi
done

echo ""
echo "✨ Setup complete!"
echo "📝 Login: user1@test.com / test123"
echo "🎾 Visit http://localhost:8081 to see the completed games"
