-- Правильное создание 3 игр для User 1 с верными счётами

-- Параметры
-- USER_ID: 5ed135c7-27de-4da1-9b8d-952fa51ecb18
-- PLAYER_1 (User 1): d3847d5f-4898-49a8-ad39-76fcfb2a6132
-- PLAYER_2 (User 5): 55177827-58b0-45db-8426-f99963c62da6
-- PLAYER_3 (User 6): 35eead24-ec8d-4673-90bc-fc431d3a587a
-- PLAYER_4 (User 7): 3b567b69-e54b-4408-95f4-9c9210a5ca66

-- ===== ИГРА 1 =====
WITH game1_creation AS (
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status,
                     courts_count, rounds_planned, scoring_mode, points_per_player_per_match,
                     auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (gen_random_uuid(), 'Игра 1: User 1', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time,
         'AMERICANA', 'FINISHED', 3, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN',
         '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid)
  RETURNING id as game_id
),
game1_players AS (
  INSERT INTO registrations (id, event_id, player_id, status, created_at)
  SELECT gen_random_uuid(), g.game_id, p.pid, 'REGISTERED', CURRENT_TIMESTAMP
  FROM game1_creation g
  CROSS JOIN (VALUES
    ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid),
    ('55177827-58b0-45db-8426-f99963c62da6'::uuid),
    ('35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid),
    ('3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid)
  ) AS p(pid)
),
game1_round AS (
  INSERT INTO rounds (id, event_id, round_number)
  SELECT gen_random_uuid(), game_id, 1
  FROM game1_creation
  RETURNING id as round_id, event_id as game_id
),
game1_matches AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  SELECT
    gen_random_uuid(), gr.round_id, row_number() OVER(), team_a_p1, team_a_p2, team_b_p1, team_b_p2, 'FINISHED'
  FROM game1_round gr
  CROSS JOIN (VALUES
    ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid,
     '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid),
    ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid,
     '55177827-58b0-45db-8426-f99963c62da6'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid),
    ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid,
     '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid)
  ) AS m(team_a_p1, team_a_p2, team_b_p1, team_b_p2)
  RETURNING id as match_id
),
game1_scores AS (
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at)
  SELECT gen_random_uuid(), m.match_id, s.team_a, s.team_b, CURRENT_TIMESTAMP
  FROM game1_matches m
  CROSS JOIN (VALUES
    (21, 15), (20, 18), (19, 17)
  ) AS s(team_a, team_b)
  WHERE (SELECT count(*) FROM game1_matches) = 3
),
game1_set_scores AS (
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
  SELECT gen_random_uuid(), m.match_id, 1, s.team_a, s.team_b
  FROM game1_matches m
  CROSS JOIN (VALUES
    (21, 15), (20, 18), (19, 17)
  ) AS s(team_a, team_b)
  WHERE (SELECT count(*) FROM game1_matches) = 3
),
game1_update_stats AS (
  UPDATE players SET games_played = games_played + 3
  WHERE id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid,
               '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid)
),
game1_calibration AS (
  UPDATE users SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - 3)
  WHERE player_id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid,
                      '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid)
)
SELECT 'Игра 1 создана' as result;
