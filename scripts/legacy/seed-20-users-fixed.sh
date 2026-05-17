#!/bin/bash
# Создаёт 20 участников без зависимостей от jq
# Использование: bash scripts/seed-20-users-fixed.sh [API_BASE_URL]

set -e

API_BASE="${1:-http://localhost:8080}"
ADMIN_USER="admin228"
ADMIN_PASS="admin228"

echo "Логин в админку..."
LOGIN_RESP=$(curl -s -X POST "$API_BASE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

# Используем sed для более надежного парсинга
TOKEN=$(echo "$LOGIN_RESP" | sed 's/.*"token":"\([^"]*\)".*/\1/')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "$LOGIN_RESP" ]; then
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

for i in $(seq 1 20); do
  email="${i}@gmail.com"
  name="${NAMES[$((i-1))]}"
  gender="${GENDERS[$((i-1))]}"
  rating=$((800 + (i - 1) * 50))

  calibration=0
  if echo " 4 8 12 16 20" | grep -q " $i "; then
    calibration=3
  fi

  echo -n "  $email ($name, рейтинг $rating, калибровка=$calibration) ... "

  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/resp.json -X POST "$API_BASE/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"email\":\"$email\",\"password\":\"1\",\"name\":\"$name\",\"rating\":$rating,\"surveyCompleted\":true,\"calibrationEventsRemaining\":$calibration,\"gender\":\"$gender\"}")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "OK"
  else
    MSG=$(cat /tmp/resp.json 2>/dev/null || echo "HTTP $HTTP_CODE")
    if echo "$MSG" | grep -q "already registered\|already exists"; then
      echo "уже есть"
    else
      echo "ошибка: $MSG"
    fi
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
