-- ПРАВИЛЬНЫЙ СПОСОБ СОЗДАНИЯ ИГРЫ
-- Этот скрипт создаёт игру с правильным расчётом всех полей

-- Параметры (отредактируйте):
-- @game_title = название игры
-- @player_ids = UUID игроков (4 штуки)
-- @matches = матчи с результатами
-- @creator_user_id = ID пользователя-создателя события

-- ПРИМЕР:
-- Game: 'Тестовая Игра'
-- Players: User 1, User 5, User 6, User 7
-- Matches:
--   1. User1+User5 vs User6+User7 = 21:15
--   2. User1+User6 vs User5+User7 = 20:18
--   3. User1+User7 vs User5+User6 = 19:17

WITH game_creation AS (
  -- 1. Создать событие
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status,
                     courts_count, rounds_planned, scoring_mode, points_per_player_per_match,
                     auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (
    gen_random_uuid(),
    'Тестовая Игра',
    CURRENT_DATE,
    '18:00:00'::time,
    '20:00:00'::time,
    'AMERICANA',
    'FINISHED',
    1,
    1,
    'POINTS',
    6,
    true,
    CURRENT_TIMESTAMP,
    'ROUND_ROBIN',
    '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid
  )
  RETURNING id
),
player_list AS (
  VALUES
    ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid), -- User 1
    ('55177827-58b0-45db-8426-f99963c62da6'::uuid), -- User 5
    ('35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid), -- User 6
    ('3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid)  -- User 7
),
register_players AS (
  -- 2. Зарегистрировать игроков
  INSERT INTO registrations (id, event_id, player_id, status, created_at)
  SELECT gen_random_uuid(), g.id, p.column1, 'REGISTERED', CURRENT_TIMESTAMP
  FROM game_creation g
  CROSS JOIN player_list p
  RETURNING event_id
),
create_round AS (
  -- 3. Создать раунд
  INSERT INTO rounds (id, event_id, round_number)
  SELECT gen_random_uuid(), event_id, 1
  FROM register_players
  GROUP BY event_id
  RETURNING id, event_id
),
match1 AS (
  -- 4a. Матч 1: User1+User5 vs User6+User7, 21:15 (выиграла Team A)
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  SELECT
    gen_random_uuid(),
    cr.id,
    1,
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid,
    '55177827-58b0-45db-8426-f99963c62da6'::uuid,
    '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid,
    '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid,
    'FINISHED'
  FROM create_round cr
  RETURNING id, round_id
),
match2 AS (
  -- 4b. Матч 2: User1+User6 vs User5+User7, 20:18 (выиграла Team A)
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  SELECT
    gen_random_uuid(),
    cr.id,
    2,
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid,
    '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid,
    '55177827-58b0-45db-8426-f99963c62da6'::uuid,
    '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid,
    'FINISHED'
  FROM create_round cr
  RETURNING id, round_id
),
match3 AS (
  -- 4c. Матч 3: User1+User7 vs User5+User6, 19:17 (выиграла Team A)
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  SELECT
    gen_random_uuid(),
    cr.id,
    3,
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid,
    '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid,
    '55177827-58b0-45db-8426-f99963c62da6'::uuid,
    '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid,
    'FINISHED'
  FROM create_round cr
  RETURNING id, round_id
),
add_draft_scores AS (
  -- 5a. Добавить draft scores
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at)
  SELECT gen_random_uuid(), m1.id, 21, 15, CURRENT_TIMESTAMP FROM match1 m1
  UNION ALL
  SELECT gen_random_uuid(), m2.id, 20, 18, CURRENT_TIMESTAMP FROM match2 m2
  UNION ALL
  SELECT gen_random_uuid(), m3.id, 19, 17, CURRENT_TIMESTAMP FROM match3 m3
  RETURNING match_id
),
add_set_scores AS (
  -- 5b. Добавить set scores
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
  SELECT gen_random_uuid(), m1.id, 1, 21, 15 FROM match1 m1
  UNION ALL
  SELECT gen_random_uuid(), m2.id, 1, 20, 18 FROM match2 m2
  UNION ALL
  SELECT gen_random_uuid(), m3.id, 1, 19, 17 FROM match3 m3
),
rating_changes_m1a AS (
  -- 6a. Матч 1 - Team A выиграла (+30)
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
  SELECT
    gen_random_uuid(),
    cr.event_id,
    m1.id,
    p.id,
    p.rating,
    30,
    p.rating + 30,
    CURRENT_TIMESTAMP
  FROM create_round cr
  CROSS JOIN match1 m1
  CROSS JOIN players p
  WHERE p.id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid)
),
rating_changes_m1b AS (
  -- Матч 1 - Team B проиграла (-30)
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
  SELECT
    gen_random_uuid(),
    cr.event_id,
    m1.id,
    p.id,
    p.rating,
    -30,
    p.rating - 30,
    CURRENT_TIMESTAMP
  FROM create_round cr
  CROSS JOIN match1 m1
  CROSS JOIN players p
  WHERE p.id IN ('35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid)
),
rating_changes_m2a AS (
  -- 6b. Матч 2 - Team A выиграла (+30)
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
  SELECT
    gen_random_uuid(),
    cr.event_id,
    m2.id,
    p.id,
    p.rating,
    30,
    p.rating + 30,
    CURRENT_TIMESTAMP
  FROM create_round cr
  CROSS JOIN match2 m2
  CROSS JOIN players p
  WHERE p.id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid)
),
rating_changes_m2b AS (
  -- Матч 2 - Team B проиграла (-30)
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
  SELECT
    gen_random_uuid(),
    cr.event_id,
    m2.id,
    p.id,
    p.rating,
    -30,
    p.rating - 30,
    CURRENT_TIMESTAMP
  FROM create_round cr
  CROSS JOIN match2 m2
  CROSS JOIN players p
  WHERE p.id IN ('55177827-58b0-45db-8426-f99963c62da6'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid)
),
rating_changes_m3a AS (
  -- 6c. Матч 3 - Team A выиграла (+30)
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
  SELECT
    gen_random_uuid(),
    cr.event_id,
    m3.id,
    p.id,
    p.rating,
    30,
    p.rating + 30,
    CURRENT_TIMESTAMP
  FROM create_round cr
  CROSS JOIN match3 m3
  CROSS JOIN players p
  WHERE p.id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid)
),
rating_changes_m3b AS (
  -- Матч 3 - Team B проиграла (-30)
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at)
  SELECT
    gen_random_uuid(),
    cr.event_id,
    m3.id,
    p.id,
    p.rating,
    -30,
    p.rating - 30,
    CURRENT_TIMESTAMP
  FROM create_round cr
  CROSS JOIN match3 m3
  CROSS JOIN players p
  WHERE p.id IN ('55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid)
),
update_ratings AS (
  -- 7. Обновить рейтинги игроков
  SELECT
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid as pid, 90 as delta UNION
    SELECT '55177827-58b0-45db-8426-f99963c62da6'::uuid, 0 UNION
    SELECT '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, -30 UNION
    SELECT '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, -60
),
do_update_ratings AS (
  UPDATE players p
  SET rating = rating + ur.delta,
      games_played = games_played + 3
  FROM update_ratings ur
  WHERE p.id = ur.pid
),
do_update_calibration AS (
  -- 8. Обновить calibration_matches_remaining
  UPDATE users
  SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - 3)
  WHERE player_id IN (
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid,
    '55177827-58b0-45db-8426-f99963c62da6'::uuid,
    '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid,
    '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid
  )
)
SELECT 'Игра создана успешно' as result;
