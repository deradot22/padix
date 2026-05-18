-- Telegram-интеграция, Этап 2: настройки уведомлений (юзер + per-chat) + scheduler state.

-- Глобальные настройки уведомлений юзера.
-- enabled=false мгновенно глушит все исходящие сообщения от Padix в Telegram.
-- timezone хранится IANA-строкой (например "Europe/Moscow") и нужна, чтобы понимать,
-- попадает ли «сейчас» в окно тихих часов юзера.
create table telegram_user_settings (
    user_id            uuid primary key references users(id) on delete cascade,
    enabled            boolean not null default true,
    reminder_hours     integer not null default 2,
    quiet_hours_start  time null,
    quiet_hours_end    time null,
    timezone           varchar(64) not null default 'UTC',
    created_at         timestamp not null default now(),
    updated_at         timestamp not null default now(),
    constraint chk_telegram_settings_reminder_hours check (reminder_hours between 0 and 168)
);

-- Per-chat preferences: какие типы уведомлений слать в этот конкретный чат.
-- CREATED не управляется отсюда — он выбирается per-event галочкой при создании игры.
alter table telegram_chat
    add column notify_updated  boolean not null default true,
    add column notify_finished boolean not null default true,
    add column notify_reminder boolean not null default true;

-- Чтобы reminder scheduler не отправлял напоминание дважды по одному и тому же эвенту.
alter table events
    add column reminder_sent_at timestamp null;
