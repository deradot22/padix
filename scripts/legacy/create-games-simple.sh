#!/bin/bash
# Просто создаёт 5 игр через API

API_BASE="${1:-http://localhost:8080}"

echo "📅 Создаю 5 игр..."

# Получим текущую дату
DATE=$(date +%Y-%m-%d)

for i in {1..5}; do
  START_HOUR=$((17 + i))
  END_HOUR=$((19 + i))
  COURTS=$((1 + (i % 2)))

  echo -n "  Игра $i ... "

  COURTS_JSON="["
  for c in $(seq 1 $COURTS); do
    if [ $c -gt 1 ]; then COURTS_JSON="$COURTS_JSON,"; fi
    COURTS_JSON="$COURTS_JSON\"Корт $c\""
  done
  COURTS_JSON="$COURTS_JSON]"

  curl -s -X POST "$API_BASE/api/events" \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"Игра #$i\",
      \"date\": \"$DATE\",
      \"startTime\": \"${START_HOUR}:00\",
      \"endTime\": \"${END_HOUR}:00\",
      \"format\": \"AMERICANA\",
      \"pairingMode\": \"ROUND_ROBIN\",
      \"courtsCount\": $COURTS,
      \"courtNames\": $COURTS_JSON,
      \"autoRounds\": true,
      \"scoringMode\": \"POINTS\",
      \"pointsPerPlayerPerMatch\": 6
    }" > /dev/null 2>&1

  echo "✅"
done

echo ""
echo "✨ 5 игр созданы!"
