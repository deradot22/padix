-- Добавить очки к существующим матчам в режиме POINTS
INSERT INTO match_draft_scores (id, match_id, team_a_points, team_b_points, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  m.id,
  (floor(random() * 25))::integer,
  (floor(random() * 25))::integer,
  now(),
  now()
FROM matches m
LEFT JOIN match_draft_scores ds ON m.id = ds.match_id
WHERE ds.id IS NULL
  AND m.status = 'FINISHED'
LIMIT 50;

-- Проверить результат
SELECT COUNT(*) as total_scores FROM match_draft_scores;
