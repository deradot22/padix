-- Telegram «Login через бота» — UX в разы лучше OAuth-виджета.
-- Поток:
--  1. Юзер на сайте жмёт «Войти через Telegram»
--  2. Бэк создаёт одноразовый token, фронт открывает t.me/<bot>?start=auth_<token>
--  3. Telegram-app/web с открытым чатом бота — юзер тапает Start
--  4. Бот шлёт inline-кнопки «Подтвердить вход в Padix» / «Отмена»
--  5. Тап «Подтвердить» → бот вызывает api → токен помечается approved + данные юзера
--  6. Фронт всё это время поллит статус → видит approved → логинит/регистрирует юзера

create table telegram_auth_token (
    -- Случайный 32-байтный base64url token (тот же что в auth_<token> deep-link).
    token              varchar(64) primary key,
    -- pending | awaiting_approval | approved | rejected | expired
    status             varchar(32) not null default 'pending',
    -- Заполняется когда бот получает /start от юзера (но ДО подтверждения inline-кнопкой).
    -- На этом этапе уже знаем кто пытается войти, но юзер ещё не дал согласие.
    telegram_user_id   bigint,
    telegram_username  varchar(64),
    first_name         varchar(255),
    last_name          varchar(255),
    photo_url          varchar(512),
    expires_at         timestamp not null,
    approved_at        timestamp,
    -- Когда фронт обменял токен на JWT (одноразово).
    consumed_at        timestamp,
    created_at         timestamp not null default now()
);
create index idx_telegram_auth_token_expires on telegram_auth_token (expires_at);
create index idx_telegram_auth_token_status on telegram_auth_token (status, expires_at);
