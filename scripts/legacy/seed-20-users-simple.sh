#!/bin/bash
# Создаёт 20 участников без зависимостей от jq
# Использование: bash scripts/seed-20-users-simple.sh [API_BASE_URL]

API_BASE="${1:-http://localhost:8080}"
ADMIN_USER="admin228"
ADMIN_PASS="admin228"

echo "Логин в админку..."
LOGIN_RESP=$(curl -s -X POST "$API_BASE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Ошибка: не удалось получить токен."
  echo "Ответ: $LOGIN_RESP"
  exit 1
fi

echo "OK, токен получен."
echo ""
echo "Создаю 20 участников с разными рейтингами (800–1750)..."

NAMES=(
  "Алексей Иванов" "Мария Петрова" "Дмитрий Сидоров" "Ольга Козлова"
  "Сергей Новиков" "Анна Морозова" "Андрей Волков" "Екатерина Соловьёва"
  "Павел Лебедев" "Наталья Кузнецова" "Максим Попов" "Елена Васильева"
  "Артём Зайцев" "Татьяна Павлова" "Николай Семёнов" "Ксения Голубева"
  "Виктор Богданов" "Юлия Воронова" "Роман Орлов" "Дарья Медведева"
)

GENDERS=("M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F")
CALIBRATION_USERS="4 8 12 16 20"

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

  BODY=$(cat <<EOF
{
  "email":"$email",
  "password":"1",
  "name":"$name",
  "rating":$rating,
  "surveyCompleted":true,
  "calibrationEventsRemaining":$calibration,
  "gender":"$gender"
}
EOF
)

  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/resp.json -X POST "$API_BASE/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$BODY")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "OK"
  elif grep -q "already registered\|already exists" /tmp/resp.json 2>/dev/null; then
    echo "уже есть"
  else
    MSG=$(grep -o '"message":"[^"]*' /tmp/resp.json 2>/dev/null | cut -d'"' -f4 || echo "HTTP $HTTP_CODE")
    echo "ошибка: $MSG"
  fi
done

echo ""
echo "Готово."
echo ""
echo "Тестовые учётные данные:"
echo "  Email: 1@gmail.com - 20@gmail.com"
echo "  Пароль: 1"
echo ""
echo "На калибровке (3 события): users 4, 8, 12, 16, 20"
echo "  Пример: 4@gmail.com (Ольга Козлова)"
