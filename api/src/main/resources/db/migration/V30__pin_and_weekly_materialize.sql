-- Закрепление анонса серии и режим материализации "в конце недели" (воскресенье)
-- ----------------------------------------------------------------------------

-- 1) Настройка "закреплять анонс": per-owner чекбокс в настройках Telegram-бота.
alter table telegram_user_settings
    add column pin_announcement boolean not null default false;

-- 2) ID последнего закрепленного сообщения для каждого пост-анонса в чате.
-- Используется, чтобы при следующем анонсе в том же чате открепить предыдущий.
alter table event_telegram_post
    add column pinned_message_id bigint;

-- Индекс по telegram_chat_id + pinned_message_id для быстрого поиска предыдущих закрепленных.
create index if not exists ix_event_telegram_post_pinned
    on event_telegram_post (telegram_chat_id)
    where pinned_message_id is not null;

-- 3) Режим материализации серии:
--    HOURS_BEFORE   — старое поведение (за materialize_hours_before часов до игры)
--    WEEKLY_SUNDAY  — новое: материализовать в воскресенье вечером (для игр следующей недели)
alter table event_series
    add column materialize_mode varchar(32) not null default 'HOURS_BEFORE';

alter table event_series
    add constraint chk_event_series_materialize_mode
    check (materialize_mode in ('HOURS_BEFORE', 'WEEKLY_SUNDAY'));
