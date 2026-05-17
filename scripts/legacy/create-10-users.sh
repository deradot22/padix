#!/bin/bash

API="http://localhost:8080"

echo "🎮 СОЗДАНИЕ 10 ПОЛЬЗОВАТЕЛЕЙ НА КАЛИБРОВКЕ"
echo ""

# Разные уровни для опроса
LEVELS=(1 1.5 2 2.5 3 3.5 4 4.5 5 5.5)

for i in {1..10}; do
  EMAIL="user$i@test.local"
  PASSWORD="test123456"
  NAME="User $i"
  LEVEL="${LEVELS[$((i-1))]}"
  
  echo "👤 Пользователь $i (Уровень $LEVEL)"
  
  # 1. Регистрация
  REG=$(curl -s -X POST "$API/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$EMAIL\",
      \"password\": \"$PASSWORD\",
      \"name\": \"$NAME\",
      \"gender\": \"M\"
    }")
  
  TOKEN=$(echo "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  
  if [ -z "$TOKEN" ]; then
    echo "  ❌ Ошибка регистрации"
    continue
  fi
  
  echo "  ✅ Зарегистрирован"
  
  # 2. Пройти опрос
  SURVEY=$(curl -s -X POST "$API/api/survey/submit" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"version\": 1,
      \"answers\": {
        \"level\": \"$LEVEL\"
      }
    }")
  
  echo "  ✅ Опрос пройден (уровень $LEVEL)"
  
  # 3. Установить калибровку через БД
  USER_ID=$(docker-compose -f "E:/project/padix/compose.dev.yml" exec -T db psql -U padix -d padix -q -t -c "
    SELECT id FROM users WHERE email = '$EMAIL' LIMIT 1;
  " | xargs)
  
  if [ -n "$USER_ID" ]; then
    docker-compose -f "E:/project/padix/compose.dev.yml" exec -T db psql -U padix -d padix -q -c "
      UPDATE users 
      SET calibration_matches_remaining = 30
      WHERE id = '$USER_ID';
    " > /dev/null
    echo "  ✅ На калибровке (30 матчей)"
  fi
  
  echo ""
done

echo "════════════════════════════════════"
echo "✨ 10 ПОЛЬЗОВАТЕЛЕЙ СОЗДАНЫ!"
echo "════════════════════════════════════"
echo ""

# Проверка
echo "📊 Проверка:"
docker-compose -f "E:/project/padix/compose.dev.yml" exec -T db psql -U padix -d padix << 'QUERY'
SELECT 
  name,
  email,
  survey_completed,
  calibration_matches_remaining
FROM users
ORDER BY created_at DESC;
QUERY

