-- Ограничение по рейтингу для регистрации в игре (задача #9).
-- Обе границы опциональны и включительны: можно задать только min, только max, или обе.
-- NULL — соответствующая граница не задана (без ограничения).
ALTER TABLE events ADD COLUMN min_rating INTEGER;
ALTER TABLE events ADD COLUMN max_rating INTEGER;
