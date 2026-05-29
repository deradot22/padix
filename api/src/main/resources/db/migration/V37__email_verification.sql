-- Подтверждение email-адреса при регистрации.
-- Юзеру шлётся одноразовая ссылка вида /verify-email?token=<...>, по клику email помечается верифицированным.
-- Сейчас бэк просто логирует ссылку в консоль; продолжаем использовать Resend как реальный отправитель когда задан RESEND_API_KEY.

-- 1. Поле на UserAccount: когда email был подтверждён. null = не подтверждён.
--    Все существующие аккаунты считаем подтверждёнными (отметим now()), иначе текущие юзеры
--    при следующем входе увидят баннер «подтвердите email» — недружелюбно.
alter table users add column email_verified_at timestamp;
update users set email_verified_at = now() where email_verified_at is null;

-- 2. Таблица токенов подтверждения. Храним hash, не сам token (если БД утечёт — токены не утекут).
create table email_verification_tokens (
    id          uuid        primary key,
    user_id     uuid        not null references users(id) on delete cascade,
    token_hash  varchar(64) not null,
    -- Покрывает кейсы: подтверждение нового email при регистрации,
    -- подтверждение нового email при смене в профиле, ручной resend.
    purpose     varchar(32) not null default 'REGISTRATION',
    -- email на момент создания токена. Если юзер сменил email пока токен был активен —
    -- старый токен невалиден (consume сверяет).
    email       varchar(255) not null,
    expires_at  timestamp   not null,
    used_at     timestamp,
    created_at  timestamp   not null default now()
);

create unique index idx_email_verification_token_hash on email_verification_tokens (token_hash);
create index idx_email_verification_user_id on email_verification_tokens (user_id);
create index idx_email_verification_expires_at on email_verification_tokens (expires_at);
