-- Create Game 2: User 1
WITH game2 AS (
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (gen_random_uuid(), 'Игра 2: User 1', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'IN_PROGRESS', 1, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid)
  RETURNING id
),
game2_regs AS (
  INSERT INTO registrations (id, event_id, player_id, status, created_at)
  SELECT gen_random_uuid(), g.id, p.id, 'REGISTERED', CURRENT_TIMESTAMP
  FROM game2 g
  CROSS JOIN (VALUES (1::uuid), (5::uuid), (6::uuid), (7::uuid)) p(id)
  RETURNING event_id
),
rounds2 AS (
  INSERT INTO rounds (id, event_id, round_number, created_at)
  SELECT gen_random_uuid(), event_id, 1, CURRENT_TIMESTAMP FROM game2_regs LIMIT 1
  RETURNING id, event_id
),
match1 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), id, 1, 1::uuid, 5::uuid, 6::uuid, 7::uuid, 'FINISHED', CURRENT_TIMESTAMP FROM rounds2
  RETURNING id, round_id
),
match2 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), id, 2, 1::uuid, 6::uuid, 5::uuid, 7::uuid, 'FINISHED', CURRENT_TIMESTAMP FROM rounds2
  RETURNING id, round_id
),
match3 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), id, 3, 1::uuid, 7::uuid, 5::uuid, 6::uuid, 'FINISHED', CURRENT_TIMESTAMP FROM rounds2
  RETURNING id, round_id
)
INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
SELECT gen_random_uuid(), id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM match1
UNION ALL
SELECT gen_random_uuid(), id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM match2
UNION ALL
SELECT gen_random_uuid(), id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM match3;

-- Create Game 3: User 1
WITH game3 AS (
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (gen_random_uuid(), 'Игра 3: User 1', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'IN_PROGRESS', 1, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid)
  RETURNING id
),
game3_regs AS (
  INSERT INTO registrations (id, event_id, player_id, status, created_at)
  SELECT gen_random_uuid(), g.id, p.id, 'REGISTERED', CURRENT_TIMESTAMP
  FROM game3 g
  CROSS JOIN (VALUES (1::uuid), (8::uuid), (9::uuid), (10::uuid)) p(id)
  RETURNING event_id
),
rounds3 AS (
  INSERT INTO rounds (id, event_id, round_number, created_at)
  SELECT gen_random_uuid(), event_id, 1, CURRENT_TIMESTAMP FROM game3_regs LIMIT 1
  RETURNING id, event_id
),
match1 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), id, 1, 1::uuid, 8::uuid, 9::uuid, 10::uuid, 'FINISHED', CURRENT_TIMESTAMP FROM rounds3
  RETURNING id, round_id
),
match2 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), id, 2, 1::uuid, 9::uuid, 8::uuid, 10::uuid, 'FINISHED', CURRENT_TIMESTAMP FROM rounds3
  RETURNING id, round_id
),
match3 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), id, 3, 1::uuid, 10::uuid, 8::uuid, 9::uuid, 'FINISHED', CURRENT_TIMESTAMP FROM rounds3
  RETURNING id, round_id
)
INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
SELECT gen_random_uuid(), id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM match1
UNION ALL
SELECT gen_random_uuid(), id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM match2
UNION ALL
SELECT gen_random_uuid(), id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM match3;
