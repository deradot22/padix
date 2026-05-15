-- Функция для создания завершённой игры с правильным расчётом рейтингов
-- Использование: SELECT create_complete_game(
--   'Игра название',
--   ARRAY['uuid_player1', 'uuid_player2', 'uuid_player3', 'uuid_player4'],
--   ARRAY[
--     ROW(1, 2, 3, 4, 21, 15),  -- матч 1: p1+p2 vs p3+p4, 21:15
--     ROW(1, 3, 2, 4, 20, 18),  -- матч 2: p1+p3 vs p2+p4, 20:18
--     ROW(1, 4, 2, 3, 19, 17)   -- матч 3: p1+p4 vs p2+p3, 19:17
--   ]
-- );

CREATE OR REPLACE FUNCTION create_complete_game(
  game_title TEXT,
  player_ids UUID[],
  match_data RECORD[]
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_round_id UUID;
  v_user_id UUID := '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid;
  v_match RECORD;
  v_match_id UUID;
  v_player_id UUID;
  v_old_rating INT;
  v_new_rating INT;
  v_delta INT;
  v_ka INT;
  v_kb INT;
  v_i INT := 1;
BEGIN
  -- 1. Создать событие
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status,
                     courts_count, rounds_planned, scoring_mode, points_per_player_per_match,
                     auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (gen_random_uuid(), game_title, CURRENT_DATE, '18:00:00'::time, '20:00:00'::time,
         'AMERICANA', 'FINISHED', 1, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP,
         'ROUND_ROBIN', v_user_id)
  RETURNING id INTO v_event_id;

  -- 2. Зарегистрировать игроков
  INSERT INTO registrations (id, event_id, player_id, status, created_at)
  SELECT gen_random_uuid(), v_event_id, unnest(player_ids), 'REGISTERED', CURRENT_TIMESTAMP;

  -- 3. Создать раунд
  INSERT INTO rounds (id, event_id, round_number)
  VALUES (gen_random_uuid(), v_event_id, 1)
  RETURNING id INTO v_round_id;

  -- 4. Создать матчи со счётами и рейтинг-изменениями
  FOREACH v_match IN ARRAY match_data
  LOOP
    -- Создать матч
    INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
    VALUES (gen_random_uuid(), v_round_id, v_i,
            (v_match)."f1", (v_match)."f2", (v_match)."f3", (v_match)."f4", 'FINISHED')
    RETURNING id INTO v_match_id;

    -- Добавить draft score
    INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at)
    VALUES (gen_random_uuid(), v_match_id, (v_match)."f5", (v_match)."f6", CURRENT_TIMESTAMP);

    -- Добавить set score
    INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
    VALUES (gen_random_uuid(), v_match_id, 1, (v_match)."f5", (v_match)."f6");

    -- Рассчитать рейтинг-изменения (простая логика: побеждающая команда +30, проигрывающая -30)
    IF (v_match)."f5" > (v_match)."f6" THEN
      -- Team A выиграла
      INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
      SELECT gen_random_uuid(), v_event_id, v_match_id, p.id, p.rating, 30, p.rating + 30, CURRENT_TIMESTAMP
      FROM players p WHERE p.id IN ((v_match)."f1", (v_match)."f2");

      INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
      SELECT gen_random_uuid(), v_event_id, v_match_id, p.id, p.rating, -30, p.rating - 30, CURRENT_TIMESTAMP
      FROM players p WHERE p.id IN ((v_match)."f3", (v_match)."f4");

      -- Обновить рейтинги игроков
      UPDATE players SET rating = rating + 30 WHERE id IN ((v_match)."f1", (v_match)."f2");
      UPDATE players SET rating = rating - 30 WHERE id IN ((v_match)."f3", (v_match)."f4");
    ELSE
      -- Team B выиграла
      INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
      SELECT gen_random_uuid(), v_event_id, v_match_id, p.id, p.rating, -30, p.rating - 30, CURRENT_TIMESTAMP
      FROM players p WHERE p.id IN ((v_match)."f1", (v_match)."f2");

      INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
      SELECT gen_random_uuid(), v_event_id, v_match_id, p.id, p.rating, 30, p.rating + 30, CURRENT_TIMESTAMP
      FROM players p WHERE p.id IN ((v_match)."f3", (v_match)."f4");

      -- Обновить рейтинги игроков
      UPDATE players SET rating = rating - 30 WHERE id IN ((v_match)."f1", (v_match)."f2");
      UPDATE players SET rating = rating + 30 WHERE id IN ((v_match)."f3", (v_match)."f4");
    END IF;

    -- Обновить games_played для всех участников
    UPDATE players SET games_played = games_played + 1
    WHERE id IN ((v_match)."f1", (v_match)."f2", (v_match)."f3", (v_match)."f4");

    v_i := v_i + 1;
  END LOOP;

  -- 5. Обновить calibration_matches_remaining для всех игроков
  UPDATE users
  SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - array_length(match_data, 1))
  WHERE player_id = ANY(player_ids);

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;
