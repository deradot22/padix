-- Тоггл «Показывать шансы выигрыша» в профиле.
-- По умолчанию выключен — фича опциональная, чтобы не давить на аутсайдеров.
-- См. docs/PADIX_FEATURES_OVERVIEW.md §5.6 (Шансы выигрыша, фаза 1).
ALTER TABLE users
    ADD COLUMN show_win_probability BOOLEAN NOT NULL DEFAULT FALSE;
