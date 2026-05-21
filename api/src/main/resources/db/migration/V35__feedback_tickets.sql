-- Тикеты обратной связи (фаза 1, fire-and-forget).
-- Юзер шлёт текст + категорию + опц. вложение (фото/видео как data URL).
-- Админ читает в /admin → «Обратная связь». Статусов и переписки нет — внешний контакт.
-- См. docs/PADIX_FEATURES_OVERVIEW.md §16 (Обратная связь / тикеты).
CREATE TABLE feedback_tickets (
    id                    UUID        PRIMARY KEY,
    user_id               UUID        NOT NULL REFERENCES users (id),
    category              VARCHAR(16) NOT NULL,
    message               TEXT        NOT NULL,
    -- data URL вида data:image/jpeg;base64,... или data:video/mp4;base64,...
    -- Хранится в TEXT, чтобы не плодить отдельный bucket; для MVP достаточно.
    -- Лимит размера валидируется на сервере (см. FeedbackService).
    attachment_data_url   TEXT        NULL,
    attachment_mime       VARCHAR(64) NULL,
    attachment_size_bytes INTEGER     NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_tickets_user ON feedback_tickets (user_id);
CREATE INDEX idx_feedback_tickets_created ON feedback_tickets (created_at DESC);
