#!/bin/bash
# Создаёт 20 тестовых участников
# Использование: bash scripts/seed-users.sh [API_BASE_URL]

API_BASE="${1:-http://localhost:8080}"

echo "🔐 Логин в админку..."
LOGIN_RESP=$(curl -s -X POST "$API_BASE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin228","password":"admin228"}')

TOKEN=$(echo "$LOGIN_RESP" | sed 's/.*"token":"\([^"]*\)".*/\1/')

if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 100 ]; then
  echo "❌ Ошибка: не удалось получить токен"
  exit 1
fi

echo "✅ Токен получен"
echo ""
echo "👥 Создаю 20 участников..."

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
  [[ " 4 8 12 16 20 " == *" $i "* ]] && calibration=3

  printf "  %-25s (рейтинг %4d, калибр=%d) ... " "$email" "$rating" "$calibration"

  # Используем переменные в JSON напрямую
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/user_resp.json -X POST "$API_BASE/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"email\":\"$email\",\"password\":\"1\",\"name\":\"$name\",\"rating\":$rating,\"surveyCompleted\":true,\"calibrationEventsRemaining\":$calibration,\"gender\":\"$gender\"}")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅"
  elif grep -q "already" /tmp/user_resp.json 2>/dev/null; then
    echo "⏭️  уже есть"
  else
    echo "❌ HTTP $HTTP_CODE"
  fi
done

echo ""
echo "✨ Готово!"
echo ""
echo "📝 Учётные данные для тестирования:"
echo "   Email:    1@gmail.com - 20@gmail.com"
echo "   Пароль:   1"
echo ""
echo "🎯 На калибровке (3 события): 4, 8, 12, 16, 20"
echo "   Пример: 4@gmail.com (Ольга Козлова)"
