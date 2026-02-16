#!/bin/bash
# Создаёт 20 участников: 1@gmail.com .. 20@gmail.com, пароль "1"
# 15 откалиброваны, 5 на калибровке (users 4, 8, 12, 16, 20)
# Требует запущенный бэкенд на localhost:8080
# Использование: ./scripts/seed-20-users.sh [API_BASE_URL]

set -e
API_BASE="${1:-http://localhost:8080}"
ADMIN_USER="${APP_ADMIN_USERNAME:-admin228}"
ADMIN_PASS="${APP_ADMIN_PASSWORD:-admin228}"

echo "Логин в админку..."
TOKEN=$(curl -s -X POST "$API_BASE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Ошибка: не удалось получить токен. Проверьте, что бэкенд запущен и admin credentials верны."
  exit 1
fi

NAMES=(
  "Алексей Иванов" "Мария Петрова" "Дмитрий Сидоров" "Ольга Козлова"
  "Сергей Новиков" "Анна Морозова" "Андрей Волков" "Екатерина Соловьёва"
  "Павел Лебедев" "Наталья Кузнецова" "Максим Попов" "Елена Васильева"
  "Артём Зайцев" "Татьяна Павлова" "Николай Семёнов" "Ксения Голубева"
  "Виктор Богданов" "Юлия Воронова" "Роман Орлов" "Дарья Медведева"
)

GENDERS=("M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F")

# Users on calibration: 4, 8, 12, 16, 20 (1-indexed)
CALIBRATION_USERS="4 8 12 16 20"

echo "Создаю 20 участников с разными рейтингами (800–1750)..."
for i in $(seq 1 20); do
  email="${i}@gmail.com"
  name="${NAMES[$((i-1))]}"
  gender="${GENDERS[$((i-1))]}"
  rating=$((800 + (i - 1) * 50))

  calibration=0
  if echo "$CALIBRATION_USERS" | grep -qw "$i"; then
    calibration=3
  fi

  echo -n "  $email ($name, рейтинг $rating, калибровка=$calibration) ... "
  resp=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"email\":\"$email\",\"password\":\"1\",\"name\":\"$name\",\"rating\":$rating,\"surveyCompleted\":true,\"calibrationEventsRemaining\":$calibration,\"gender\":\"$gender\"}")
  code=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')
  if [ "$code" = "201" ] || [ "$code" = "200" ]; then
    echo "OK"
  elif echo "$body" | jq -e '.message' >/dev/null 2>&1; then
    msg=$(echo "$body" | jq -r '.message')
    if [[ "$msg" == *"already registered"* ]] || [[ "$msg" == *"already exists"* ]]; then
      echo "уже есть"
    else
      echo "ошибка: $msg"
    fi
  else
    echo "HTTP $code"
  fi
done
echo "Готово."
