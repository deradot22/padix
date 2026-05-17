#!/bin/bash
# Auto-complete games: finds all unfinished games on a date and automatically completes them

API="http://localhost:8080"
TARGET_DATE="${1:-2026-04-22}"  # Default to tomorrow

echo "🤖 Auto-completing games for $TARGET_DATE..."

# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "$API/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin228","password":"admin228"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

# Get first user token
USER_TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@test.com","password":"test123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
  echo "⚠️  user1@test.com not available, creating test users..."
  
  # Create 10 users
  for i in {1..10}; do
    EMAIL="user$i@test.com"
    curl -s -X POST "$API/api/admin/users" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -d "{\"email\":\"$EMAIL\",\"password\":\"test123\",\"name\":\"Player $i\",\"rating\":$((1000 + i * 100)),\"surveyCompleted\":true,\"calibrationEventsRemaining\":0,\"gender\":\"M\"}" > /dev/null 2>&1
  done
  
  echo "✅ Users created"
  
  # Get token again
  USER_TOKEN=$(curl -s -X POST "$API/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"user1@test.com","password":"test123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)
fi

# Get all players
PLAYER_IDS=$(curl -s "$API/api/players/rating?limit=20" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -10)

# Get upcoming events on target date
echo "📅 Fetching events for $TARGET_DATE..."
EVENTS=$(curl -s "$API/api/events/upcoming?from=$TARGET_DATE&to=$TARGET_DATE")

EVENT_IDS=$(echo "$EVENTS" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$EVENT_IDS" ]; then
  echo "❌ No events found for $TARGET_DATE"
  exit 1
fi

echo "✅ Found $(echo "$EVENT_IDS" | wc -l) events"
echo ""

# Process each event
for EID in $EVENT_IDS; do
  echo "🎾 Processing event: $EID"
  
  # Register players
  for PID in $PLAYER_IDS; do
    curl -s -X POST "$API/api/events/$EID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $USER_TOKEN" \
      -d "{\"playerId\": \"$PID\"}" > /dev/null 2>&1
  done
  echo "   ✅ Registered players"
  
  # Start event
  curl -s -X POST "$API/api/events/$EID/start" \
    -H "Authorization: Bearer $USER_TOKEN" > /dev/null 2>&1
  echo "   ✅ Game started"
  
  # Wait for matches to be created
  sleep 1
  
  # Get event details
  EVENT_DATA=$(curl -s "$API/api/events/$EID" \
    -H "Authorization: Bearer $USER_TOKEN")
  
  # Extract match IDs from event data
  MATCH_IDS=$(echo "$EVENT_DATA" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | tail -n +2 | head -20)
  
  # Score matches
  MATCH_COUNT=0
  for MID in $MATCH_IDS; do
    curl -s -X POST "$API/api/events/matches/$MID/score" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $USER_TOKEN" \
      -d "{\"points\": {\"teamAPoints\": 21, \"teamBPoints\": 15}}" > /dev/null 2>&1
    MATCH_COUNT=$((MATCH_COUNT + 1))
  done
  echo "   ✅ Scored $MATCH_COUNT matches"
  
  # Finish event
  curl -s -X POST "$API/api/events/$EID/finish" \
    -H "Authorization: Bearer $USER_TOKEN" > /dev/null 2>&1
  echo "   ✅ Game finished"
  echo ""
done

echo "✨ All games completed!"
echo "🎯 Visit http://localhost:8081 and login with user1@test.com / test123"
