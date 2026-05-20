-- Привязка подписки к конкретным Telegram-чатам автора.
-- CSV из UUID, например "a1b2c3d4-...,e5f6g7h8-...". Пустая строка → fallback
-- на «все группы автора» (для обратной совместимости со старыми сериями).
alter table event_series
    add column target_chat_ids text not null default '';
