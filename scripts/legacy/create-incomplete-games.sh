#!/bin/bash
API="http://localhost:8080"
DATE="2026-04-23"  # Tomorrow

echo "Creating 3 incomplete games for $DATE..."

TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@test.com","password":"test123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

for i in {1..3}; do
  START_HOUR=$((10 + i))
  END_HOUR=$((12 + i))
  
  RESP=$(curl -s -X POST "$API/api/events" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"title\": \"Incomplete Game #$i\",
      \"date\": \"$DATE\",
      \"startTime\": \"${START_HOUR}:00\",
      \"endTime\": \"${END_HOUR}:00\",
      \"format\": \"AMERICANA\",
      \"pairingMode\": \"ROUND_ROBIN\",
      \"courtsCount\": 2,
      \"courtNames\": [\"Court 1\", \"Court 2\"],
      \"autoRounds\": true,
      \"scoringMode\": \"POINTS\",
      \"pointsPerPlayerPerMatch\": 6
    }")
  
  EID=$(echo "$RESP" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
  echo "  ✅ Created game #$i: $EID (INCOMPLETE - ready for auto-complete)"
done

echo ""
echo "Now you can run: bash auto-complete-games.sh $DATE"
