-- Telegram-интеграция: привязка чатов и публикация анонсов игр.

-- Одноразовые токены для привязки чата (личка / группа / канал) к юзеру.
-- Юзер генерит токен на сайте; затем либо открывает t.me/<bot>?start=<token>
-- (для лички), либо отправляет /link <token> в чат, где есть бот (для групп/каналов).
create table telegram_link_token (
    token       varchar(64) primary key,
    user_id     uuid not null references users(id) on delete cascade,
    expires_at  timestamp not null,
    created_at  timestamp not null default now()
);
create index idx_telegram_link_token_user on telegram_link_token(user_id);

-- Привязанные Telegram-чаты, куда юзер разрешил публиковать.
create table telegram_chat (
    id          uuid primary key,
    user_id     uuid not null references users(id) on delete cascade,
    chat_id     bigint not null,
    chat_type   varchar(32) not null,    -- PRIVATE, GROUP, SUPERGROUP, CHANNEL
    title       varchar(255) not null,
    linked_at   timestamp not null default now(),
    constraint uk_telegram_chat_user_chat unique (user_id, chat_id)
);
create index idx_telegram_chat_user on telegram_chat(user_id);

-- Лог опубликованных сообщений: какие игры запостили в какие чаты.
-- message_id храним, чтобы на следующих этапах можно было редактировать/отвечать.
create table event_telegram_post (
    id                uuid primary key,
    event_id          uuid not null references events(id) on delete cascade,
    telegram_chat_id  uuid not null references telegram_chat(id) on delete cascade,
    message_id        bigint not null,
    posted_at         timestamp not null default now()
);
create index idx_event_telegram_post_event on event_telegram_post(event_id);

-- Состояние long-polling: последний обработанный update_id (singleton).
create table telegram_polling_state (
    id              smallint primary key,
    last_update_id  bigint not null default 0,
    updated_at      timestamp not null default now(),
    constraint chk_telegram_polling_state_singleton check (id = 1)
);
insert into telegram_polling_state (id, last_update_id, updated_at) values (1, 0, now());
