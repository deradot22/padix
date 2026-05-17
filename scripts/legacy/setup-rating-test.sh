#!/bin/bash
API="http://localhost:8080"
D1=$(date -d "+1 day" +%Y-%m-%d)
D2=$(date -d "+2 days" +%Y-%m-%d)
D3=$(date -d "+3 days" +%Y-%m-%d)
D4=$(date -d "+4 days" +%Y-%m-%d)

echo "=========================================="
echo "🚀 Rating Test Setup"
echo "=========================================="

# =============================================
# 1. Полная очистка базы
# =============================================
echo ""
echo "🧹 Clearing database..."
docker exec padix-db-1 psql -U padix -d padix -c "
  TRUNCATE TABLE user_rating_notifications CASCADE;
  TRUNCATE TABLE rating_changes CASCADE;
  TRUNCATE TABLE match_draft_scores CASCADE;
  TRUNCATE TABLE match_set_scores CASCADE;
  TRUNCATE TABLE matches CASCADE;
  TRUNCATE TABLE rounds CASCADE;
  TRUNCATE TABLE event_courts CASCADE;
  TRUNCATE TABLE event_invites CASCADE;
  TRUNCATE TABLE registrations CASCADE;
  TRUNCATE TABLE events CASCADE;
  TRUNCATE TABLE friend_requests CASCADE;
  TRUNCATE TABLE friends CASCADE;
  DELETE FROM users WHERE email NOT LIKE '%admin%';
  DELETE FROM players WHERE id NOT IN (SELECT player_id FROM users WHERE player_id IS NOT NULL);
" > /dev/null 2>&1
echo "  ✅ Database cleared"

# =============================================
# 2. Создание 10 пользователей
# =============================================
echo ""
echo "👥 Creating 10 users..."
ADMIN_TOKEN=$(curl -s -X POST "$API/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin228","password":"admin228"}' \
  | tr -d '\r' | grep -o '"token":"[^"]*' | cut -d'"' -f4 | tr -d '\r\n ')

if [ -z "$ADMIN_TOKEN" ]; then echo "❌ No admin token"; exit 1; fi

NAMES=("Player 1" "Player 2" "Player 3" "Player 4" "Player 5" "Player 6" "Player 7" "Player 8" "Player 9" "Player 10")
GENDERS=("M" "F" "M" "F" "M" "F" "M" "F" "M" "F")
for i in $(seq 1 10); do
  NAME="${NAMES[$((i-1))]}"; GENDER="${GENDERS[$((i-1))]}"; RATING=$((1000 + (i-1) * 100))
  curl -s -X POST "$API/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"email\":\"${i}@test.com\",\"password\":\"test123\",\"name\":\"$NAME\",\"rating\":$RATING,\"surveyCompleted\":true,\"calibrationEventsRemaining\":0,\"gender\":\"$GENDER\"}" > /dev/null 2>&1
  echo "  ✅ ${i}@test.com ($NAME, rating=$RATING)"
done

# Set calibration_matches_remaining = 30 for all new users.
# EventService decrements this per match, so after games:
#   38-match players → 0 (out of calibration)
#   12-match players → 18 (still in calibration)
docker exec padix-db-1 psql -U padix -d padix -c \
  "UPDATE users SET calibration_matches_remaining = 30 WHERE email NOT LIKE '%admin%';" > /dev/null 2>&1
echo "  ✅ calibration_matches_remaining = 30 set for all users"

# =============================================
# 3. Токены и ID игроков
# =============================================
echo ""
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@test.com","password":"test123"}' \
  | tr -d '\r' | grep -o '"token":"[^"]*' | cut -d'"' -f4 | tr -d '\r\n ')

if [ -z "$TOKEN" ]; then echo "❌ No token — check API is running"; exit 1; fi
echo "🔑 Token (len=${#TOKEN})"

echo "🔍 Getting player IDs..."
ALL_IDS=$(curl -s "$API/api/players/rating?limit=15" \
  -H "Authorization: Bearer $TOKEN" \
  | tr -d '\r' | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -10)
IDS=($ALL_IDS)
echo "  Got ${#IDS[@]} players"

if [ "${#IDS[@]}" -lt 10 ]; then echo "❌ Expected 10 players, got ${#IDS[@]}"; exit 1; fi

P1="${IDS[0]}"; P2="${IDS[1]}"; P3="${IDS[2]}"; P4="${IDS[3]}"
P5="${IDS[4]}"; P6="${IDS[5]}"; P7="${IDS[6]}"; P8="${IDS[7]}"
P9="${IDS[8]}"; P10="${IDS[9]}"

# =============================================
# BIG GAMES A1-A3: P1-P8, 2 корта, ~14 матчей каждая → итого 42+ матча
# =============================================
echo ""
echo "🎮 Big games A1-A3 (P1-P8, 2 courts)..."

# --- A1 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game A1\",\"date\":\"$D1\",\"startTime\":\"08:00\",\"endTime\":\"10:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":2,\"courtNames\":[\"Court 1\",\"Court 2\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ A1 failed: $RESP"; else
  echo "  A1 ($EID)"
  for PID in $P1 $P2 $P3 $P4 $P5 $P6 $P7 $P8; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# --- A2 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game A2\",\"date\":\"$D2\",\"startTime\":\"08:00\",\"endTime\":\"10:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":2,\"courtNames\":[\"Court 1\",\"Court 2\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ A2 failed: $RESP"; else
  echo "  A2 ($EID)"
  for PID in $P1 $P2 $P3 $P4 $P5 $P6 $P7 $P8; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# --- A3 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game A3\",\"date\":\"$D3\",\"startTime\":\"08:00\",\"endTime\":\"10:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":2,\"courtNames\":[\"Court 1\",\"Court 2\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ A3 failed: $RESP"; else
  echo "  A3 ($EID)"
  for PID in $P1 $P2 $P3 $P4 $P5 $P6 $P7 $P8; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# --- A4 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game A4\",\"date\":\"$D1\",\"startTime\":\"14:00\",\"endTime\":\"16:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":2,\"courtNames\":[\"Court 1\",\"Court 2\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ A4 failed: $RESP"; else
  echo "  A4 ($EID)"
  for PID in $P1 $P2 $P3 $P4 $P5 $P6 $P7 $P8; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# --- A5 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game A5\",\"date\":\"$D2\",\"startTime\":\"14:00\",\"endTime\":\"16:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":2,\"courtNames\":[\"Court 1\",\"Court 2\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ A5 failed: $RESP"; else
  echo "  A5 ($EID)"
  for PID in $P1 $P2 $P3 $P4 $P5 $P6 $P7 $P8; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# =============================================
# SMALL GAMES B1-B4: P9-P10 + партнёры, 1 корт, ~3 матча каждая → итого ~12 матчей
# =============================================
echo ""
echo "🎮 Small games B1-B4 (P9+P10, 1 court)..."

# --- B1: P9,P10,P1,P2 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game B1\",\"date\":\"$D4\",\"startTime\":\"08:00\",\"endTime\":\"10:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":1,\"courtNames\":[\"Court 1\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ B1 failed: $RESP"; else
  echo "  B1 ($EID)"
  for PID in $P9 $P10 $P1 $P2; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# --- B2: P9,P10,P3,P4 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game B2\",\"date\":\"$D4\",\"startTime\":\"10:00\",\"endTime\":\"12:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":1,\"courtNames\":[\"Court 1\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ B2 failed: $RESP"; else
  echo "  B2 ($EID)"
  for PID in $P9 $P10 $P3 $P4; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# --- B3: P9,P10,P5,P6 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game B3\",\"date\":\"$D4\",\"startTime\":\"12:00\",\"endTime\":\"14:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":1,\"courtNames\":[\"Court 1\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ B3 failed: $RESP"; else
  echo "  B3 ($EID)"
  for PID in $P9 $P10 $P5 $P6; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# --- B4: P9,P10,P7,P8 ---
RESP=$(curl -s -X POST "$API/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Game B4\",\"date\":\"$D4\",\"startTime\":\"14:00\",\"endTime\":\"16:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":1,\"courtNames\":[\"Court 1\"],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")
EID=$(echo "$RESP" | tr -d '\r' | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 | tr -d '\r\n ')
if [ -z "$EID" ]; then echo "  ❌ B4 failed: $RESP"; else
  echo "  B4 ($EID)"
  for PID in $P9 $P10 $P7 $P8; do
    curl -s -X POST "$API/api/events/$EID/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"playerId\":\"$PID\"}" > /dev/null 2>&1
  done
  curl -s -X POST "$API/api/events/$EID/close-registration" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  curl -s -X POST "$API/api/events/$EID/start" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  sleep 1
  MATCH_IDS=$(docker exec padix-db-1 psql -U padix -d padix -t -c "SELECT m.id FROM matches m JOIN rounds r ON m.round_id=r.id WHERE r.event_id='$EID';" | xargs)
  MC=0
  for MID in $MATCH_IDS; do
    SC=$((RANDOM % 10))
    case $SC in 0) A=24;B=0;; 1) A=20;B=4;; 2) A=18;B=6;; 3) A=16;B=8;; 4) A=14;B=10;;
      5) A=12;B=12;; 6) A=10;B=14;; 7) A=8;B=16;; 8) A=6;B=18;; 9) A=4;B=20;; esac
    curl -s -X POST "$API/api/events/matches/$MID/score" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"points\":{\"teamAPoints\":$A,\"teamBPoints\":$B}}" > /dev/null 2>&1
    MC=$((MC+1))
  done
  curl -s -X POST "$API/api/events/$EID/finish" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
  echo "    ✅ $MC matches scored and finished"
fi

# =============================================
# Итог
# =============================================
echo ""
echo "📊 Matches per player:"
docker exec padix-db-1 psql -U padix -d padix -t -c "
SELECT pl.name, COUNT(DISTINCT pm.mid) as matches
FROM players pl
JOIN (
  SELECT team_a_p1 as pid, id as mid FROM matches
  UNION ALL SELECT team_a_p2, id FROM matches
  UNION ALL SELECT team_b_p1, id FROM matches
  UNION ALL SELECT team_b_p2, id FROM matches
) pm ON pl.id = pm.pid
GROUP BY pl.name ORDER BY matches DESC;" 2>&1

echo ""
echo "=========================================="
echo "✅ Done! Login: 1@test.com / test123"
echo "=========================================="
