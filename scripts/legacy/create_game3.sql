-- Create Game 3: User 1 with Users 8, 9, 10
WITH game3 AS (
  INSERT INTO events (id, title, event_date, start_time, end_time, format, status, courts_count, rounds_planned, scoring_mode, points_per_player_per_match, auto_rounds, created_at, pairing_mode, created_by_user_id)
  VALUES (gen_random_uuid(), 'Игра 3: User 1', CURRENT_DATE, '18:00:00'::time, '20:00:00'::time, 'AMERICANA', 'IN_PROGRESS', 1, 1, 'POINTS', 6, true, CURRENT_TIMESTAMP, 'ROUND_ROBIN', '5ed135c7-27de-4da1-9b8d-952fa51ecb18'::uuid)
  RETURNING id
),
game3_regs AS (
  INSERT INTO registrations (id, event_id, player_id, status, created_at)
  SELECT gen_random_uuid(), g.id, p.id, 'REGISTERED', CURRENT_TIMESTAMP
  FROM game3 g
  CROSS JOIN (VALUES ('d3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid), ('741382e1-015f-4a63-ac7a-e77731e7ca89'::uuid), ('9664e121-e6e5-4c07-b03a-a4154b20405f'::uuid), ('cd29e9e1-b424-483d-b043-46bcdfe644ad'::uuid)) p(id)
  RETURNING event_id
),
rounds3 AS (
  INSERT INTO rounds (id, event_id, round_number, created_at)
  SELECT gen_random_uuid(), event_id, 1, CURRENT_TIMESTAMP FROM game3_regs LIMIT 1
  RETURNING id, event_id
),
m1 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), r.id, 1,
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid,
    '741382e1-015f-4a63-ac7a-e77731e7ca89'::uuid,
    '9664e121-e6e5-4c07-b03a-a4154b20405f'::uuid,
    'cd29e9e1-b424-483d-b043-46bcdfe644ad'::uuid,
    'FINISHED', CURRENT_TIMESTAMP
  FROM rounds3 r
  RETURNING id
),
m2 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), r.id, 2,
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid,
    '9664e121-e6e5-4c07-b03a-a4154b20405f'::uuid,
    '741382e1-015f-4a63-ac7a-e77731e7ca89'::uuid,
    'cd29e9e1-b424-483d-b043-46bcdfe644ad'::uuid,
    'FINISHED', CURRENT_TIMESTAMP
  FROM rounds3 r
  RETURNING id
),
m3 AS (
  INSERT INTO matches (id, round_id, court_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, status, created_at)
  SELECT gen_random_uuid(), r.id, 3,
    'd3847d5f-4898-49a8-ad39-76fcfb2a6132'::uuid,
    'cd29e9e1-b424-483d-b043-46bcdfe644ad'::uuid,
    '741382e1-015f-4a63-ac7a-e77731e7ca89'::uuid,
    '9664e121-e6e5-4c07-b03a-a4154b20405f'::uuid,
    'FINISHED', CURRENT_TIMESTAMP
  FROM rounds3 r
  RETURNING id
)
INSERT INTO match_set_scores (id, match_id, set_number, team_a_games, team_b_games)
SELECT gen_random_uuid(), m1.id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM m1
UNION ALL
SELECT gen_random_uuid(), m2.id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM m2
UNION ALL
SELECT gen_random_uuid(), m3.id, 1, (RANDOM() * 10 + 15)::int, (RANDOM() * 10 + 5)::int FROM m3;
