-- Fixed pairs (задача #8, формат FIXED_PAIRS): пара игроков в игре с общим team_id.
-- Обе регистрации пары несут один team_id. NULL для одиночных форматов
-- (AMERICANA / MEXICANO) — полная обратная совместимость.
ALTER TABLE registrations ADD COLUMN team_id UUID;
CREATE INDEX idx_registrations_event_team ON registrations (event_id, team_id);
