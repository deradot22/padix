#!/bin/bash
# Создаёт 3 тестовые игры по 4 человека. Автор и участник — 12@gmail.com (Елена Васильева).
# Требует: запущенный бэкенд, выполненный seed-20-users.sh
# Использование: ./scripts/create-test-games-3x4.sh [API_BASE_URL]

set -e
API_BASE="${1:-http://localhost:8080}"

NAMES=("Елена Васильева" "Артём Зайцев" "Татьяна Павлова" "Николай Семёнов")

echo "=== Логин 12@gmail.com ==="
USER_TOKEN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"12@gmail.com","password":"1"}' \
  | jq -r '.token')

if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
  echo "Ошибка: не удалось войти как 12@gmail.com. Выполните ./scripts/seed-20-users.sh"
  exit 1
fi

echo "Получаю ID игроков..."
RATING_JSON=$(curl -s "$API_BASE/api/players/rating")
PLAYER_IDS=()
for name in "${NAMES[@]}"; do
  pid=$(echo "$RATING_JSON" | jq -r --arg n "$name" '.[] | select(.name == $n) | .id')
  if [ -z "$pid" ] || [ "$pid" = "null" ]; then
    echo "Игрок '$name' не найден."
    exit 1
  fi
  PLAYER_IDS+=("$pid")
done

DATE=$(date +%Y-%m-%d)

for g in 1 2 3; do
  echo ""
  echo "=== Игра $g/3 ==="
  EVENT_RESP=$(curl -s -X POST "$API_BASE/api/events" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -d "{
      \"title\": \"Тестовая игра $g (4 человека)\",
      \"date\": \"$DATE\",
      \"startTime\": \"18:00\",
      \"endTime\": \"20:00\",
      \"format\": \"AMERICANA\",
      \"pairingMode\": \"ROUND_ROBIN\",
      \"courtsCount\": 1,
      \"courtNames\": [\"Корт 1\"],
      \"autoRounds\": true,
      \"scoringMode\": \"POINTS\",
      \"pointsPerPlayerPerMatch\": 6
    }")
  EVENT_ID=$(echo "$EVENT_RESP" | jq -r '.id')
  if [ -z "$EVENT_ID" ] || [ "$EVENT_ID" = "null" ]; then
    echo "Ошибка создания игры $g"
    echo "$EVENT_RESP" | jq .
    exit 1
  fi
  echo "  Создана: $EVENT_ID"
  for i in 0 1 2 3; do
    pid="${PLAYER_IDS[$i]}"
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/api/events/$EVENT_ID/register" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $USER_TOKEN" \
      -d "{\"playerId\": \"$pid\"}")
    echo "  Регистрация ${NAMES[$i]}: HTTP $code"
  done
  echo "  URL: $API_BASE/events/$EVENT_ID"
done

echo ""
echo "Готово. 3 игры по 4 человека созданы. Автор: 12@gmail.com (Елена Васильева)."
