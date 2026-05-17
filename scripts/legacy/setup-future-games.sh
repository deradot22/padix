#!/bin/bash
API="http://localhost:8080"
TOMORROW="${1:-$(date -d "+1 day" +%Y-%m-%d)}"

echo "🎾 Creating games for $TOMORROW"
echo ""

# Clean up old games from previous runs for this date
echo "🧹 Cleaning up old games..."
docker exec padix-db-1 psql -U padix -d padix -c "
  DELETE FROM match_draft_scores
  WHERE match_id IN (
    SELECT m.id FROM matches m
    JOIN rounds r ON m.round_id = r.id
    JOIN events e ON r.event_id = e.id
    WHERE e.event_date = '$TOMORROW'
  );
  DELETE FROM matches
  WHERE round_id IN (
    SELECT r.id FROM rounds r
    JOIN events e ON r.event_id = e.id
    WHERE e.event_date = '$TOMORROW'
  );
  DELETE FROM rounds
  WHERE event_id IN (
    SELECT e.id FROM events e
    WHERE e.event_date = '$TOMORROW'
  );
  DELETE FROM events
  WHERE event_date = '$TOMORROW';
" > /dev/null 2>&1
echo ""

# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "$API/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin228","password":"admin228"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Create users 1-10
echo "👥 Creating users user1-user10..."
for i in {1..10}; do
  EMAIL="user$i@test.com"
  curl -s -X POST "$API/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"test123\",\"name\":\"Player $i\",\"rating\":$((1200 - i * 20)),\"surveyCompleted\":true,\"calibrationEventsRemaining\":0,\"gender\":\"M\"}" > /dev/null 2>&1
  echo "  ✅ user$i@test.com"
done

echo ""

# Login as user1
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@test.com","password":"test123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Get player IDs from API (first 10 players by rating)
echo "🔍 Getting player IDs..."
PLAYER_IDS=$(curl -s "$API/api/players/rating?limit=15" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -10)

echo "Found $(echo "$PLAYER_IDS" | wc -l) players"
echo ""

# Create 5 games
echo "🎮 Creating 5 games..."
echo ""

for i in {1..5}; do
  START_HOUR=$((9 + i))
  END_HOUR=$((11 + i))
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
      \"date\": \"$TOMORROW\",
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
    echo "Game #$i"

    # Register players
    NEEDED=$((COURTS * 4))
    j=0
    for PID in $PLAYER_IDS; do
      if [ $j -lt $NEEDED ]; then
        curl -s -X POST "$API/api/events/$EID/register" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $TOKEN" \
          -d "{\"playerId\": \"$PID\"}" > /dev/null 2>&1
        j=$((j + 1))
      fi
    done
    echo "  ✅ Registered $NEEDED players"

    # Close registration
    curl -s -X POST "$API/api/events/$EID/close-registration" \
      -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1

    # Start game
    curl -s -X POST "$API/api/events/$EID/start" \
      -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
    echo "  ✅ Game started"

    # Wait for pairings
    sleep 2

    # Score matches FIRST (while game is IN_PROGRESS, API requires this)
    MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "
      SELECT m.id FROM matches m
      JOIN rounds r ON m.round_id = r.id
      WHERE r.event_id = '$EID';" | xargs)

    MATCH_COUNT=0
    for MID in $MATCH_IDS; do
      SCORE_CHOICE=$((RANDOM % 10))
      case $SCORE_CHOICE in
        0) TEAM_A=24; TEAM_B=0 ;;
        1) TEAM_A=20; TEAM_B=4 ;;
        2) TEAM_A=18; TEAM_B=6 ;;
        3) TEAM_A=16; TEAM_B=8 ;;
        4) TEAM_A=14; TEAM_B=10 ;;
        5) TEAM_A=12; TEAM_B=12 ;;
        6) TEAM_A=10; TEAM_B=14 ;;
        7) TEAM_A=8; TEAM_B=16 ;;
        8) TEAM_A=6; TEAM_B=18 ;;
        9) TEAM_A=4; TEAM_B=20 ;;
      esac
      curl -s -X POST "$API/api/events/matches/$MID/score" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "{\"points\": {\"teamAPoints\": $TEAM_A, \"teamBPoints\": $TEAM_B}}" > /dev/null 2>&1
      MATCH_COUNT=$((MATCH_COUNT + 1))
    done

    echo "  ✅ Scored $MATCH_COUNT matches with random results"

    # Finish game AFTER scoring (finishEvent promotes scores to match_set_scores)
    curl -s -X POST "$API/api/events/$EID/finish" \
      -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
    echo "  ✅ Game finished"
    echo ""
  fi
done

echo "✨ Complete! 5 games created with random results"
echo "📝 Players: user1@test.com - user10@test.com (password: test123)"
echo "🎯 Open http://localhost:8081"
