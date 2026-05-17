#!/bin/bash

# ПРАВИЛЬНОЕ СОЗДАНИЕ ИГРЫ - версия 2
# Более надёжная обработка UUID

CONTAINER="padix-db-1"
USER_ID="5ed135c7-27de-4da1-9b8d-952fa51ecb18"

GAME_TITLE="Новая Игра Test"
PLAYER_1="d3847d5f-4898-49a8-ad39-76fcfb2a6132" # User 1
PLAYER_2="55177827-58b0-45db-8426-f99963c62da6" # User 5
PLAYER_3="35eead24-ec8d-4673-90bc-fc431d3a587a" # User 6
PLAYER_4="3b567b69-e54b-4408-95f4-9c9210a5ca66" # User 7

echo "=== Создание игры: $GAME_TITLE ==="

# Используем PL/pgSQL функцию для создания всего в одной транзакции
docker exec $CONTAINER psql -U padix -d padix << 'ENDSQL'
DO $$
DECLARE
  v_game_id UUID;
  v_round_id UUID;
  v_match1_id UUID;
  v_match2_id UUID;
  v_match3_id UUID;
  v_user_id UUID := '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid;
  v_p1 UUID := 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid;
  v_p2 UUID := '55177827-58b0-45db-8426-f99963c62da6'::uuid;
  v_p3 UUID := '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid;
  v_p4 UUID := '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid;
BEGIN
  -- 1. Создать событие
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count,
                      rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds,
                      created_at, pairing_mode, created_by_user_id)
  VALUES (gen_random_uuid(), 'Новая Игра Test', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time,
         'AMERICANA', 'FINISHED', 1, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', v_user_id)
  RETURNING id INTO v_game_id;

  RAISE NOTICE 'Событие создано: %', v_game_id;

  -- 2. Зарегистрировать игроков
  INSERT INTO registrations (id, event_id, player_id, status, created_at)
  VALUES
    (gen_random_uuid(), v_game_id, v_p1, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_p2, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_p3, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_p4, 'REGISTERED', CURRENT_TIMESTAMP);

  RAISE NOTICE 'Игроки зарегистрированы';

  -- 3. Создать раунд
  INSERT INTO rounds (id, event_id, round_number)
  VALUES (gen_random_uuid(), v_game_id, 1)
  RETURNING id INTO v_round_id;

  RAISE NOTICE 'Раунд создан: %', v_round_id;

  -- 4a. Матч 1: P1+P2 vs P3+P4, 21:15 (Team A выиграла)
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  VALUES (gen_random_uuid(), v_round_id, 1, v_p1, v_p2, v_p3, v_p4, 'FINISHED')
  RETURNING id INTO v_match1_id;

  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at)
  VALUES (gen_random_uuid(), v_match1_id, 21, 15, CURRENT_TIMESTAMP);

  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
  VALUES (gen_random_uuid(), v_match1_id, 1, 21, 15);

  RAISE NOTICE 'Матч 1 создан: % (21:15)', v_match1_id;

  -- 4b. Матч 2: P1+P3 vs P2+P4, 20:18 (Team A выиграла)
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  VALUES (gen_random_uuid(), v_round_id, 2, v_p1, v_p3, v_p2, v_p4, 'FINISHED')
  RETURNING id INTO v_match2_id;

  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at)
  VALUES (gen_random_uuid(), v_match2_id, 20, 18, CURRENT_TIMESTAMP);

  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
  VALUES (gen_random_uuid(), v_match2_id, 1, 20, 18);

  RAISE NOTICE 'Матч 2 создан: % (20:18)', v_match2_id;

  -- 4c. Матч 3: P1+P4 vs P2+P3, 19:17 (Team A выиграла)
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  VALUES (gen_random_uuid(), v_round_id, 3, v_p1, v_p4, v_p2, v_p3, 'FINISHED')
  RETURNING id INTO v_match3_id;

  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at)
  VALUES (gen_random_uuid(), v_match3_id, 19, 17, CURRENT_TIMESTAMP);

  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
  VALUES (gen_random_uuid(), v_match3_id, 1, 19, 17);

  RAISE NOTICE 'Матч 3 создан: % (19:17)', v_match3_id;

  -- 5. Добавить rating changes
  -- Матч 1: Team A выиграла
  INSERT INTO rating_changes VALUES
    (gen_random_uuid(), v_game_id, v_match1_id, v_p1, 1000, 30, 1030, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match1_id, v_p2, 1000, 30, 1030, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match1_id, v_p3, 1000, -30, 970, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match1_id, v_p4, 1000, -30, 970, CURRENT_TIMESTAMP);

  -- Матч 2: Team A выиграла
  INSERT INTO rating_changes VALUES
    (gen_random_uuid(), v_game_id, v_match2_id, v_p1, 1030, 30, 1060, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match2_id, v_p3, 1000, 30, 1030, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match2_id, v_p2, 1030, -30, 1000, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match2_id, v_p4, 970, -30, 940, CURRENT_TIMESTAMP);

  -- Матч 3: Team A выиграла
  INSERT INTO rating_changes VALUES
    (gen_random_uuid(), v_game_id, v_match3_id, v_p1, 1060, 30, 1090, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match3_id, v_p4, 940, 30, 970, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match3_id, v_p2, 1000, -30, 970, CURRENT_TIMESTAMP),
    (gen_random_uuid(), v_game_id, v_match3_id, v_p3, 1030, -30, 1000, CURRENT_TIMESTAMP);

  RAISE NOTICE 'Rating changes добавлены';

  -- 6. Обновить рейтинги игроков
  UPDATE players SET rating = 1090 WHERE id = v_p1;  -- выиграл все 3
  UPDATE players SET rating = 970 WHERE id = v_p2;   -- проиграл 2 из 3
  UPDATE players SET rating = 1000 WHERE id = v_p3;  -- выиграл 1, проиграл 2
  UPDATE players SET rating = 970 WHERE id = v_p4;   -- выиграл 1, проиграл 2

  RAISE NOTICE 'Рейтинги обновлены';

  -- 7. Обновить games_played
  UPDATE players SET games_played = games_played + 3
  WHERE id IN (v_p1, v_p2, v_p3, v_p4);

  RAISE NOTICE 'Games played обновлено';

  -- 8. Обновить calibration
  UPDATE users SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - 3)
  WHERE player_id IN (v_p1, v_p2, v_p3, v_p4);

  RAISE NOTICE 'Калибровка обновлена';
  RAISE NOTICE '=== Игра создана успешно: % ===', v_game_id;
END $$;
ENDSQL
