-- Кто из юзеров ввёл итоговый счёт матча.
-- Используется, чтобы:
--   1) показывать "Введён: Имя" в UI,
--   2) запретить переввод не-автору, если кто-то другой уже сохранил.
-- nullable: для исторических данных значение неизвестно.
ALTER TABLE match_set_scores
    ADD COLUMN submitted_by_user_id UUID NULL REFERENCES users (id);

CREATE INDEX IF NOT EXISTS idx_match_set_scores_submitted_by
    ON match_set_scores (submitted_by_user_id);
