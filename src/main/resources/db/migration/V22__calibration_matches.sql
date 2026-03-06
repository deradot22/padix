ALTER TABLE users ADD COLUMN calibration_matches_remaining INTEGER NOT NULL DEFAULT 0;

UPDATE users u
SET calibration_matches_remaining = GREATEST(30 - COALESCE(p.games_played, 0), 0)
FROM players p
WHERE u.player_id = p.id
  AND (u.calibration_events_remaining > 0 OR p.games_played < 30);

UPDATE players SET ntrp = CASE
    WHEN rating < 800 THEN '1.0'
    WHEN rating < 900 THEN '1.5'
    WHEN rating < 1000 THEN '2.0'
    WHEN rating < 1100 THEN '2.5'
    WHEN rating < 1200 THEN '3.0'
    WHEN rating < 1350 THEN '3.5'
    WHEN rating < 1500 THEN '4.0'
    WHEN rating < 1700 THEN '4.5'
    ELSE '5.0+'
END;
