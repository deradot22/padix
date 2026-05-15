#!/bin/bash
# Создаёт 20 тестовых участников для Padix
# Использование: bash scripts/seed-20-users-final.sh [API_BASE_URL]

API_BASE="${1:-http://localhost:8080}"

echo "🔐 Логин в админку..."
LOGIN_RESP=$(curl -s -X POST "$API_BASE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin228","password":"admin228"}')

ADMIN_TOKEN=$(echo "$LOGIN_RESP" | sed 's/.*"token":"\([^"]*\)".*/\1/')

if [ -z "$ADMIN_TOKEN" ] || [ ${#ADMIN_TOKEN} -lt 100 ]; then
  echo "❌ Ошибка: не удалось получить токен"
  exit 1
fi

echo "✅ Токен получен"
echo ""
echo "👥 Создаю 20 участников..."

NAMES=(
  "Player Alexey" "Player Maria" "Player Dmitri" "Player Olga"
  "Player Sergei" "Player Anna" "Player Andrew" "Player Ekaterina"
  "Player Pavel" "Player Natalia" "Player Maxim" "Player Elena"
  "Player Artem" "Player Tatiana" "Player Nikolai" "Player Ksenia"
  "Player Victor" "Player Julia" "Player Roman" "Player Daria"
)

GENDERS=("M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F" "M" "F")

for i in $(seq 1 20); do
  email="${i}@paddle.local"
  name="${NAMES[$((i-1))]}"
  gender="${GENDERS[$((i-1))]}"
  rating=$((800 + (i - 1) * 50))

  calibration=0
  [[ " 4 8 12 16 20 " == *" $i "* ]] && calibration=3

  printf "  %2d. %-20s (email: %-20s rating: %4d cal: %d) " "$i" "$name" "$email" "$rating" "$calibration"

  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/user_resp.json -X POST "$API_BASE/api/admin/users" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"email\":\"$email\",\"password\":\"test123\",\"name\":\"$name\",\"rating\":$rating,\"surveyCompleted\":true,\"calibrationEventsRemaining\":$calibration,\"gender\":\"$gender\"}")

  if [ "$HTTP_CODE" = "201" ]; then
    echo "✅ СОЗДАН"
  elif [ "$HTTP_CODE" = "200" ]; then
    echo "✅ OK"
  elif grep -q "already" /tmp/user_resp.json 2>/dev/null; then
    echo "⏭️  СУЩЕСТВУЕТ"
  else
    echo "❌ HTTP $HTTP_CODE"
  fi
done

echo ""
echo "✨ Готово!"
echo ""
echo "📝 Учётные данные для тестирования:"
echo "   Email:    1@paddle.local - 20@paddle.local"
echo "   Пароль:   test123"
echo ""
echo "🎯 На калибровке (3 события): 4@paddle.local, 8@paddle.local, 12@paddle.local, 16@paddle.local, 20@paddle.local"
echo ""
echo "💡 Для входа используй:"
echo "   Email: 1@paddle.local"
echo "   Пароль: test123"
