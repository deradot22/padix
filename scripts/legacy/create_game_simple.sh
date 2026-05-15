#!/bin/bash

# ПРОСТОЙ СПОСОБ СОЗДАНИЯ ПРАВИЛЬНОЙ ИГРЫ
# Создаёт игру пошагово с полным контролем над каждым шагом

CONTAINER="padix-db-1"
USER_ID="5ed135c7-27de-4da1-9b8d-952fa51ecb18"

# Параметры игры (отредактируйте эти переменные)
GAME_TITLE="Новая Игра"
PLAYER_1="d3847d5f-4898-49a8-ad39-76fcfb2a6132" # User 1
PLAYER_2="55177827-58b0-45db-8426-f99963c62da6" # User 5
PLAYER_3="35eead24-ec8d-4673-90bc-fc431d3a587a" # User 6
PLAYER_4="3b567b69-e54b-4408-95f4-9c9210a5ca66" # User 7

# Результаты матчей (team_a_points:team_b_points)
MATCH1_RESULT="21:15"
MATCH2_RESULT="20:18"
MATCH3_RESULT="19:17"

echo "=== Создание игры: $GAME_TITLE ==="

# 1. Создать событие
GAME_ID=$(docker exec $CONTAINER psql -U padix -d padix -t -c "
INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode, created_by_user_id)
VALUES (gen_random_uuid(), '$GAME_TITLE', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'FINISHED', 1, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', '$USER_ID'::uuid)
RETURNING id;
" | tr -d ' ')

echo "✓ Событие создано: $GAME_ID"

# 2. Зарегистрировать игроков
docker exec $CONTAINER psql -U padix -d padix -1 -c "
INSERT INTO registrations (id, event_id, player_id, status, created_at)
VALUES
  (gen_random_uuid(), '$GAME_ID'::uuid, '$PLAYER_1'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '$GAME_ID'::uuid, '$PLAYER_2'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '$GAME_ID'::uuid, '$PLAYER_3'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '$GAME_ID'::uuid, '$PLAYER_4'::uuid, 'REGISTERED', CURRENT_TIMESTAMP);
" > /dev/null
echo "✓ Игроки зарегистрированы"

# 3. Создать раунд
ROUND_ID=$(docker exec $CONTAINER psql -U padix -d padix -t -c "
INSERT INTO rounds (id, event_id, round_number)
VALUES (gen_random_uuid(), '$GAME_ID'::uuid, 1)
RETURNING id;
" | tr -d ' ')

echo "✓ Раунд создан: $ROUND_ID"

# 4. Создать матчи и добавить результаты
echo "Создание матчей..."

# Матч 1: Player1+Player2 vs Player3+Player4
MATCH1_ID=$(docker exec $CONTAINER psql -U padix -d padix -t -c "
INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
VALUES (gen_random_uuid(), '$ROUND_ID'::uuid, 1, '$PLAYER_1'::uuid, '$PLAYER_2'::uuid, '$PLAYER_3'::uuid, '$PLAYER_4'::uuid, 'FINISHED')
RETURNING id;
" | tr -d ' ')

IFS=':' read MATCH1_A MATCH1_B <<< "$MATCH1_RESULT"
docker exec $CONTAINER psql -U padix -d padix -1 -c "
INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), '$MATCH1_ID'::uuid, $MATCH1_A, $MATCH1_B, CURRENT_TIMESTAMP);
INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), '$MATCH1_ID'::uuid, 1, $MATCH1_A, $MATCH1_B);
" > /dev/null
echo "  ✓ Матч 1: $MATCH1_RESULT"

# Матч 2: Player1+Player3 vs Player2+Player4
MATCH2_ID=$(docker exec $CONTAINER psql -U padix -d padix -t -c "
INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
VALUES (gen_random_uuid(), '$ROUND_ID'::uuid, 2, '$PLAYER_1'::uuid, '$PLAYER_3'::uuid, '$PLAYER_2'::uuid, '$PLAYER_4'::uuid, 'FINISHED')
RETURNING id;
" | tr -d ' ')

IFS=':' read MATCH2_A MATCH2_B <<< "$MATCH2_RESULT"
docker exec $CONTAINER psql -U padix -d padix -1 -c "
INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), '$MATCH2_ID'::uuid, $MATCH2_A, $MATCH2_B, CURRENT_TIMESTAMP);
INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), '$MATCH2_ID'::uuid, 1, $MATCH2_A, $MATCH2_B);
" > /dev/null
echo "  ✓ Матч 2: $MATCH2_RESULT"

# Матч 3: Player1+Player4 vs Player2+Player3
MATCH3_ID=$(docker exec $CONTAINER psql -U padix -d padix -t -c "
INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
VALUES (gen_random_uuid(), '$ROUND_ID'::uuid, 3, '$PLAYER_1'::uuid, '$PLAYER_4'::uuid, '$PLAYER_2'::uuid, '$PLAYER_3'::uuid, 'FINISHED')
RETURNING id;
" | tr -d ' ')

IFS=':' read MATCH3_A MATCH3_B <<< "$MATCH3_RESULT"
docker exec $CONTAINER psql -U padix -d padix -1 -c "
INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), '$MATCH3_ID'::uuid, $MATCH3_A, $MATCH3_B, CURRENT_TIMESTAMP);
INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), '$MATCH3_ID'::uuid, 1, $MATCH3_A, $MATCH3_B);
" > /dev/null
echo "  ✓ Матч 3: $MATCH3_RESULT"

echo ""
echo "=== Добавление рейтинг-изменений ==="

# 5. Добавить rating changes для каждого матча и обновить рейтинги
# Матч 1: Team A (1+2) выиграла (21 > 15)
docker exec $CONTAINER psql -U padix -d padix -1 -c "
INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
SELECT gen_random_uuid(), '$GAME_ID'::uuid, '$MATCH1_ID'::uuid, p.id, p.rating, 30, p.rating + 30, CURRENT_TIMESTAMP FROM players p WHERE p.id IN ('$PLAYER_1'::uuid, '$PLAYER_2'::uuid);
INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
SELECT gen_random_uuid(), '$GAME_ID'::uuid, '$MATCH1_ID'::uuid, p.id, p.rating, -30, p.rating - 30, CURRENT_TIMESTAMP FROM players p WHERE p.id IN ('$PLAYER_3'::uuid, '$PLAYER_4'::uuid);
UPDATE players SET rating = rating + 30 WHERE id IN ('$PLAYER_1'::uuid, '$PLAYER_2'::uuid);
UPDATE players SET rating = rating - 30 WHERE id IN ('$PLAYER_3'::uuid, '$PLAYER_4'::uuid);
" > /dev/null
echo "✓ Матч 1 рейтинги обновлены"

# Матч 2: Team A (1+3) выиграла (20 > 18)
docker exec $CONTAINER psql -U padix -d padix -1 -c "
INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
SELECT gen_random_uuid(), '$GAME_ID'::uuid, '$MATCH2_ID'::uuid, p.id, p.rating, 30, p.rating + 30, CURRENT_TIMESTAMP FROM players p WHERE p.id IN ('$PLAYER_1'::uuid, '$PLAYER_3'::uuid);
INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
SELECT gen_random_uuid(), '$GAME_ID'::uuid, '$MATCH2_ID'::uuid, p.id, p.rating, -30, p.rating - 30, CURRENT_TIMESTAMP FROM players p WHERE p.id IN ('$PLAYER_2'::uuid, '$PLAYER_4'::uuid);
UPDATE players SET rating = rating + 30 WHERE id IN ('$PLAYER_1'::uuid, '$PLAYER_3'::uuid);
UPDATE players SET rating = rating - 30 WHERE id IN ('$PLAYER_2'::uuid, '$PLAYER_4'::uuid);
" > /dev/null
echo "✓ Матч 2 рейтинги обновлены"

# Матч 3: Team A (1+4) выиграла (19 > 17)
docker exec $CONTAINER psql -U padix -d padix -1 -c "
INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
SELECT gen_random_uuid(), '$GAME_ID'::uuid, '$MATCH3_ID'::uuid, p.id, p.rating, 30, p.rating + 30, CURRENT_TIMESTAMP FROM players p WHERE p.id IN ('$PLAYER_1'::uuid, '$PLAYER_4'::uuid);
INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
SELECT gen_random_uuid(), '$GAME_ID'::uuid, '$MATCH3_ID'::uuid, p.id, p.rating, -30, p.rating - 30, CURRENT_TIMESTAMP FROM players p WHERE p.id IN ('$PLAYER_2'::uuid, '$PLAYER_3'::uuid);
UPDATE players SET rating = rating + 30 WHERE id IN ('$PLAYER_1'::uuid, '$PLAYER_4'::uuid);
UPDATE players SET rating = rating - 30 WHERE id IN ('$PLAYER_2'::uuid, '$PLAYER_3'::uuid);
" > /dev/null
echo "✓ Матч 3 рейтинги обновлены"

# 6. Обновить games_played (+3 матча на игрока)
docker exec $CONTAINER psql -U padix -d padix -1 -c "
UPDATE players SET games_played = games_played + 3
WHERE id IN ('$PLAYER_1'::uuid, '$PLAYER_2'::uuid, '$PLAYER_3'::uuid, '$PLAYER_4'::uuid);
" > /dev/null
echo "✓ games_played обновлено (+3 матча)"

# 7. Обновить calibration_matches_remaining (-3 матча на игрока)
docker exec $CONTAINER psql -U padix -d padix -1 -c "
UPDATE users SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - 3)
WHERE player_id IN ('$PLAYER_1'::uuid, '$PLAYER_2'::uuid, '$PLAYER_3'::uuid, '$PLAYER_4'::uuid);
" > /dev/null
echo "✓ calibration_matches_remaining обновлено (-3 матча)"

echo ""
echo "=== Создание завершено ==="
echo "Игра ID: $GAME_ID"
echo "Перезагрузите страницу профиля в браузере!"
