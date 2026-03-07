#!/bin/bash
# Создаёт 3 тестовые игры: 5 чел/1 корт, 8 чел/2 корта, 10 чел/2 корта.
# Автор — 12@gmail.com (Елена Васильева).
# Требует: бэкенд запущен, выполнен seed-20-users.sh
# Использование: ./scripts/create-test-games-5-8-10.sh [API_BASE_URL]

set -e
API_BASE="${1:-http://localhost:8080}"

# 5 человек: Елена + 4
NAMES_5=("Елена Васильева" "Алексей Иванов" "Мария Петрова" "Дмитрий Сидоров" "Ольга Козлова")
# 8 человек: +3
NAMES_8=("Елена Васильева" "Алексей Иванов" "Мария Петрова" "Дмитрий Сидоров" "Ольга Козлова" "Сергей Новиков" "Анна Морозова" "Андрей Волков")
# 10 человек: +2
NAMES_10=("Елена Васильева" "Алексей Иванов" "Мария Петрова" "Дмитрий Сидоров" "Ольга Козлова" "Сергей Новиков" "Анна Морозова" "Андрей Волков" "Екатерина Соловьёва" "Павел Лебедев")

echo "=== Логин 12@gmail.com ==="
USER_TOKEN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"12@gmail.com","password":"1"}' \
  | jq -r '.token')

if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
  echo "Ошибка: не удалось войти как 12@gmail.com."
  exit 1
fi

get_player_ids() {
  local names=("$@")
  local json
  json=$(curl -s "$API_BASE/api/players/rating")
  for name in "${names[@]}"; do
    echo "$json" | jq -r --arg n "$name" '.[] | select(.name == $n) | .id'
  done
}

DATE=$(date +%Y-%m-%d)

# --- Игра 1: 5 человек, 1 корт ---
echo ""
echo "=== Игра 1: 5 человек, 1 корт ==="
EVENT_RESP=$(curl -s -X POST "$API_BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{
    \"title\": \"Тест 5 человек (1 корт)\",
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
  echo "Ошибка создания игры 1"; echo "$EVENT_RESP" | jq .; exit 1
fi
echo "  Создана: $EVENT_ID"
while IFS= read -r pid; do
  [ -z "$pid" ] && continue
  curl -s -o /dev/null -X POST "$API_BASE/api/events/$EVENT_ID/register" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
    -d "{\"playerId\": \"$pid\"}"
done < <(get_player_ids "${NAMES_5[@]}")
echo "  Зарегистрировано: 5"

# --- Игра 2: 8 человек, 2 корта ---
echo ""
echo "=== Игра 2: 8 человек, 2 корта ==="
EVENT_RESP=$(curl -s -X POST "$API_BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{
    \"title\": \"Тест 8 человек (2 корта)\",
    \"date\": \"$DATE\",
    \"startTime\": \"19:00\",
    \"endTime\": \"21:00\",
    \"format\": \"AMERICANA\",
    \"pairingMode\": \"ROUND_ROBIN\",
    \"courtsCount\": 2,
    \"courtNames\": [\"Корт А\", \"Корт Б\"],
    \"autoRounds\": true,
    \"scoringMode\": \"POINTS\",
    \"pointsPerPlayerPerMatch\": 6
  }")
EVENT_ID=$(echo "$EVENT_RESP" | jq -r '.id')
if [ -z "$EVENT_ID" ] || [ "$EVENT_ID" = "null" ]; then
  echo "Ошибка создания игры 2"; echo "$EVENT_RESP" | jq .; exit 1
fi
echo "  Создана: $EVENT_ID"
while IFS= read -r pid; do
  [ -z "$pid" ] && continue
  curl -s -o /dev/null -X POST "$API_BASE/api/events/$EVENT_ID/register" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
    -d "{\"playerId\": \"$pid\"}"
done < <(get_player_ids "${NAMES_8[@]}")
echo "  Зарегистрировано: 8"

# --- Игра 3: 10 человек, 2 корта ---
echo ""
echo "=== Игра 3: 10 человек, 2 корта ==="
EVENT_RESP=$(curl -s -X POST "$API_BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{
    \"title\": \"Тест 10 человек (2 корта)\",
    \"date\": \"$DATE\",
    \"startTime\": \"19:30\",
    \"endTime\": \"21:30\",
    \"format\": \"AMERICANA\",
    \"pairingMode\": \"ROUND_ROBIN\",
    \"courtsCount\": 2,
    \"courtNames\": [\"Корт 1\", \"Корт 2\"],
    \"autoRounds\": true,
    \"scoringMode\": \"POINTS\",
    \"pointsPerPlayerPerMatch\": 6
  }")
EVENT_ID=$(echo "$EVENT_RESP" | jq -r '.id')
if [ -z "$EVENT_ID" ] || [ "$EVENT_ID" = "null" ]; then
  echo "Ошибка создания игры 3"; echo "$EVENT_RESP" | jq .; exit 1
fi
echo "  Создана: $EVENT_ID"
while IFS= read -r pid; do
  [ -z "$pid" ] && continue
  curl -s -o /dev/null -X POST "$API_BASE/api/events/$EVENT_ID/register" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
    -d "{\"playerId\": \"$pid\"}"
done < <(get_player_ids "${NAMES_10[@]}")
echo "  Зарегистрировано: 10"

echo ""
echo "Готово. Автор всех игр: 12@gmail.com (Елена Васильева)."
