#!/bin/bash
# Создаёт игры, регистрирует игроков, и завершает их с очками
# Использование: bash scripts/create-and-finish-games.sh [API_BASE_URL]

set -e

API_BASE="${1:-http://localhost:8080}"

echo "════════════════════════════════════════════════════════════"
echo "  🎮 СОЗДАНИЕ И ЗАВЕРШЕНИЕ ИГРА СО СЧЁТАМИ"
echo "════════════════════════════════════════════════════════════"
echo ""

# ============= ШАГ 0: ЛОГИН =============
echo "🔐 Логин..."
LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"1@paddle.local","password":"test123"}')

TOKEN=$(echo "$LOGIN" | sed 's/.*"token":"\([^"]*\)".*/\1/')

if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 100 ]; then
  echo "❌ Ошибка логина"
  exit 1
fi

echo "✅ Вход успешный"
echo ""

# ============= ШАГ 1: ПОЛУЧИТЬ СПИСОК ИГРОКОВ =============
echo "📋 Получаю список всех игроков..."
PLAYERS_JSON=$(curl -s -X GET "$API_BASE/api/players/rating" \
  -H "Authorization: Bearer $TOKEN")

echo "✅ Игроки загружены"
echo ""

DATE=$(date +%Y-%m-%d)
GAMES_CREATED=0

# ============= ФУНКЦИЯ ДЛЯ СОЗДАНИЯ И ЗАВЕРШЕНИЯ ИГРЫ =============
create_and_finish_game() {
  local GAME_NUM=$1
  local GAME_TITLE=$2
  local PLAYERS_START=$3
  local PLAYERS_END=$4
  local COURTS=$5

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎮 ИГРА $GAME_NUM: $GAME_TITLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # 1️⃣ Создаём игру
  echo "  1️⃣ Создаю игру..."
  COURT_NAMES=""
  for i in $(seq 1 $COURTS); do
    if [ $i -eq 1 ]; then
      COURT_NAMES="\"Корт $i\""
    else
      COURT_NAMES="$COURT_NAMES,\"Корт $i\""
    fi
  done

  EVENT=$(curl -s -X POST "$API_BASE/api/events" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"title\":\"$GAME_TITLE\",\"date\":\"$DATE\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"format\":\"AMERICANA\",\"pairingMode\":\"ROUND_ROBIN\",\"courtsCount\":$COURTS,\"courtNames\":[$COURT_NAMES],\"autoRounds\":true,\"scoringMode\":\"POINTS\",\"pointsPerPlayerPerMatch\":6}")

  # Проверяем, есть ли ошибка в ответе
  if echo "$EVENT" | grep -q '"error"'; then
    echo "     ❌ Ошибка создания игры"
    echo "     Ответ: $EVENT"
    return 1
  fi

  EVENT_ID=$(echo "$EVENT" | sed 's/.*"id":"\([^"]*\)".*/\1/')

  if [ -z "$EVENT_ID" ] || [ ${#EVENT_ID} -lt 10 ]; then
    echo "     ❌ Ошибка парсинга ID игры"
    echo "     Ответ: $EVENT"
    return 1
  fi

  echo "     ✅ Создана игра: $EVENT_ID"
  echo ""

  # 2️⃣ Регистрируем игроков
  echo "  2️⃣ Регистрирую игроков ($PLAYERS_START-$PLAYERS_END)..."
  for i in $(seq $PLAYERS_START $PLAYERS_END); do
    PLAYER_ID=$(echo "$PLAYERS_JSON" | grep -o '"id":"[^"]*"' | sed -n "${i}p" | cut -d'"' -f4)
    if [ -n "$PLAYER_ID" ]; then
      curl -s -X POST "$API_BASE/api/events/$EVENT_ID/register" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "{\"playerId\":\"$PLAYER_ID\"}" > /dev/null
      echo "     ✅ Игрок $i зарегистрирован"
    fi
  done
  echo ""

  # 3️⃣ Закрываем регистрацию
  echo "  3️⃣ Закрываю регистрацию..."
  CLOSE=$(curl -s -X POST "$API_BASE/api/events/$EVENT_ID/close-registration" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$CLOSE" | grep -q "error"; then
    echo "     ⚠️  Ошибка при закрытии регистрации (может быть уже закрыта)"
  else
    echo "     ✅ Регистрация закрыта"
  fi
  echo ""

  # 4️⃣ Запускаем игру
  echo "  4️⃣ Запускаю игру..."
  START=$(curl -s -X POST "$API_BASE/api/events/$EVENT_ID/start" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$START" | grep -q "error"; then
    echo "     ❌ Ошибка при запуске игры"
    return 1
  else
    echo "     ✅ Игра запущена"
  fi
  echo ""

  # 5️⃣ Получаем информацию о раундах и матчах
  echo "  5️⃣ Получаю информацию о раундах и матчах..."
  EVENT_DETAILS=$(curl -s -X GET "$API_BASE/api/events/$EVENT_ID" \
    -H "Authorization: Bearer $TOKEN")

  # Извлекаем все roundNumber и matchId
  ROUNDS=$(echo "$EVENT_DETAILS" | grep -o '"roundNumber":[0-9]*' | cut -d':' -f2 | sort -u)
  ROUND_COUNT=$(echo "$ROUNDS" | wc -l)
  echo "     Раундов найдено: $ROUND_COUNT"
  echo ""

  # 6️⃣ Вводим очки для каждого матча
  echo "  6️⃣ Ввожу очки для матчей..."

  # Получаем все match ID
  MATCH_IDS=$(echo "$EVENT_DETAILS" | grep -o '"id":"[^"]*"' | grep -v roundNumber | tail -n +2 | cut -d'"' -f4)

  MATCH_NUM=0
  while IFS= read -r MATCH_ID; do
    [ -z "$MATCH_ID" ] && continue

    MATCH_NUM=$((MATCH_NUM + 1))

    # Генерируем случайные очки (0-24 для каждой команды)
    TOTAL_POINTS=$((6 * 4))  # 24 очка на матч
    TEAM_A_POINTS=$((RANDOM % (TOTAL_POINTS + 1)))
    TEAM_B_POINTS=$((TOTAL_POINTS - TEAM_A_POINTS))

    # Вводим счёт
    SCORE_RESP=$(curl -s -X POST "$API_BASE/api/events/matches/$MATCH_ID/score" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"teamAPoints\":$TEAM_A_POINTS,\"teamBPoints\":$TEAM_B_POINTS}")

    if echo "$SCORE_RESP" | grep -q "error"; then
      echo "     ❌ Матч $MATCH_NUM: Ошибка ($TEAM_A_POINTS:$TEAM_B_POINTS)"
    else
      echo "     ✅ Матч $MATCH_NUM: $TEAM_A_POINTS:$TEAM_B_POINTS"
    fi
  done <<< "$MATCH_IDS"
  echo ""

  # 7️⃣ Завершаем игру
  echo "  7️⃣ Завершаю игру..."
  FINISH=$(curl -s -X POST "$API_BASE/api/events/$EVENT_ID/finish" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$FINISH" | grep -q "error"; then
    echo "     ❌ Ошибка при завершении игры"
    return 1
  else
    echo "     ✅ Игра завершена! Рейтинги обновлены"
  fi
  echo ""

  GAMES_CREATED=$((GAMES_CREATED + 1))
  return 0
}

# ============= СОЗДАЁМ 3 ИГРЫ =============

create_and_finish_game 1 "Тестовая игра 1 - Четверка" 1 4 1
create_and_finish_game 2 "Тестовая игра 2 - Восьмёрка" 2 9 2
create_and_finish_game 3 "Тестовая игра 3 - Десятка" 6 15 2

echo "════════════════════════════════════════════════════════════"
echo "✨ ВСЕ ИГРЫ СОЗДАНЫ И ЗАВЕРШЕНЫ!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📊 Итого: $GAMES_CREATED игр завершено со счётами"
echo "💡 Рейтинги игроков обновлены на основе результатов"
echo ""
