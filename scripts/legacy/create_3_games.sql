-- Создание 3 игр для User 1
BEGIN;

-- Константы
\set p1 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'
\set p2 '55177827-58b0-45db-8426-f99963c62da6'
\set p3 '35eead24-ec8d-4673-90bc-fc431d3a587a'
\set p4 '3b567b69-e54b-4408-95f4-9c9210a5ca66'
\set user_id '5ed135c7-27de-4da1-9b8d-952fa51ecb18'

-- ===== ИГРА 1 =====
DO $$
DECLARE
  game_id UUID := gen_random_uuid();
  round_id UUID := gen_random_uuid();
  m1_id UUID := gen_random_uuid();
  m2_id UUID := gen_random_uuid();
  m3_id UUID := gen_random_uuid();
BEGIN
  -- Event
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (game_id, 'Игра 1: User 1', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'FINISHED', 3, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid);

  -- Players
  INSERT INTO registrations (id, event_id, player_id, status, created_at) VALUES
    (gen_random_uuid(), game_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'REGISTERED', CURRENT_TIMESTAMP);

  -- Round
  INSERT INTO rounds (id, event_id, round_number) VALUES (round_id, game_id, 1);

  -- Match 1: 21:15
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  VALUES (m1_id, round_id, 1, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m1_id, 21, 15, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m1_id, 1, 21, 15);

  -- Match 2: 20:18
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  VALUES (m2_id, round_id, 2, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m2_id, 20, 18, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m2_id, 1, 20, 18);

  -- Match 3: 19:17
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status)
  VALUES (m3_id, round_id, 3, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m3_id, 19, 17, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m3_id, 1, 19, 17);

  -- Rating changes
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at) VALUES
    (gen_random_uuid(), game_id, m1_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 0, 30, 30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 0, 30, 30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 30, 30, 60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, -30, 30, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 30, -30, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, -30, -30, -60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 60, 30, 90, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, -60, 30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 0, -30, -30, CURRENT_TIMESTAMP);

  -- Update stats
  UPDATE players SET rating = 90 WHERE id = 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid;
  UPDATE players SET rating = -30 WHERE id = '55177827-58b0-45db-8426-f99963c62da6'::uuid;
  UPDATE players SET rating = -30 WHERE id = '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid;
  UPDATE players SET rating = -60 WHERE id = '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid;
  UPDATE players SET games_played = games_played + 3 WHERE id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid);
  UPDATE users SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - 3) WHERE player_id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid);
  RAISE NOTICE 'Игра 1 создана: %', game_id;
END $$;

-- ===== ИГРА 2 и 3 аналогично =====
DO $$
DECLARE
  game_id UUID := gen_random_uuid();
  round_id UUID := gen_random_uuid();
  m1_id UUID := gen_random_uuid();
  m2_id UUID := gen_random_uuid();
  m3_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (game_id, 'Игра 2: User 1', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'FINISHED', 3, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid);
  INSERT INTO registrations (id, event_id, player_id, status, created_at) VALUES
    (gen_random_uuid(), game_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'REGISTERED', CURRENT_TIMESTAMP);
  INSERT INTO rounds (id, event_id, round_number) VALUES (round_id, game_id, 1);
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status) VALUES (m1_id, round_id, 1, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m1_id, 21, 15, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m1_id, 1, 21, 15);
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status) VALUES (m2_id, round_id, 2, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m2_id, 20, 18, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m2_id, 1, 20, 18);
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status) VALUES (m3_id, round_id, 3, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m3_id, 19, 17, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m3_id, 1, 19, 17);
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at) VALUES
    (gen_random_uuid(), game_id, m1_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 0, 30, 30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 0, 30, 30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 30, 30, 60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, -30, 30, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 30, -30, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, -30, -30, -60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 60, 30, 90, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, -60, 30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 0, -30, -30, CURRENT_TIMESTAMP);
  UPDATE players SET rating = 90 WHERE id = 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid;
  UPDATE players SET rating = -30 WHERE id = '55177827-58b0-45db-8426-f99963c62da6'::uuid;
  UPDATE players SET rating = -30 WHERE id = '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid;
  UPDATE players SET rating = -60 WHERE id = '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid;
  UPDATE players SET games_played = games_played + 3 WHERE id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid);
  UPDATE users SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - 3) WHERE player_id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid);
  RAISE NOTICE 'Игра 2 создана: %', game_id;
END $$;

DO $$
DECLARE
  game_id UUID := gen_random_uuid();
  round_id UUID := gen_random_uuid();
  m1_id UUID := gen_random_uuid();
  m2_id UUID := gen_random_uuid();
  m3_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (game_id, 'Игра 3: User 1', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'FINISHED', 3, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid);
  INSERT INTO registrations (id, event_id, player_id, status, created_at) VALUES
    (gen_random_uuid(), game_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 'REGISTERED', CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'REGISTERED', CURRENT_TIMESTAMP);
  INSERT INTO rounds (id, event_id, round_number) VALUES (round_id, game_id, 1);
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status) VALUES (m1_id, round_id, 1, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m1_id, 21, 15, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m1_id, 1, 21, 15);
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status) VALUES (m2_id, round_id, 2, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m2_id, 20, 18, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m2_id, 1, 20, 18);
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status) VALUES (m3_id, round_id, 3, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 'FINISHED');
  INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, updated_at) VALUES (gen_random_uuid(), m3_id, 19, 17, CURRENT_TIMESTAMP);
  INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games) VALUES (gen_random_uuid(), m3_id, 1, 19, 17);
  INSERT INTO rating_changes (id, event_id, match_id, player_id, old_rating, delta, new_rating, created_at) VALUES
    (gen_random_uuid(), game_id, m1_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 0, 30, 30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 0, 30, 30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m1_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 30, 30, 60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, -30, 30, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 30, -30, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m2_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, -30, -30, -60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, 60, 30, 90, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid, -60, 30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '55177827-58b0-45db-8426-f99963c62da6'::uuid, 0, -30, -30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), game_id, m3_id, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, 0, -30, -30, CURRENT_TIMESTAMP);
  UPDATE players SET rating = 90 WHERE id = 'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid;
  UPDATE players SET rating = -30 WHERE id = '55177827-58b0-45db-8426-f99963c62da6'::uuid;
  UPDATE players SET rating = -30 WHERE id = '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid;
  UPDATE players SET rating = -60 WHERE id = '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid;
  UPDATE players SET games_played = games_played + 3 WHERE id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid);
  UPDATE users SET calibration_matches_remaining = GREATEST(0, calibration_matches_remaining - 3) WHERE player_id IN ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid, '55177827-58b0-45db-8426-f99963c62da6'::uuid, '35eead24-ec8d-4673-90bc-fc431d3a587a'::uuid, '3b567b69-e54b-4408-95f4-9c9210a5ca66'::uuid);
  RAISE NOTICE 'Игра 3 создана: %', game_id;
END $$;

COMMIT;
