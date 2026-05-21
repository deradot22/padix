-- Кто получает уведомления о новых тикетах обратной связи в Telegram.
-- Назначается админом в /admin → checkbox у юзера.
-- Может быть несколько админов одновременно (team feedback) — TG-сообщение полетит каждому,
-- у кого привязан PRIVATE TG-чат.
-- См. docs/PADIX_FEATURES_OVERVIEW.md §16.
ALTER TABLE users
    ADD COLUMN is_feedback_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_users_feedback_admin
    ON users (is_feedback_admin)
    WHERE is_feedback_admin = TRUE;
