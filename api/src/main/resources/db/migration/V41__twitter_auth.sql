-- Twitter/X Sign-In: OAuth 2.0 Authorization Code Flow с PKCE.
-- Twitter (в отличие от Google/FB) не даёт быстро верифицировать токен по REST —
-- нужен полноценный обмен code → access_token через api.x.com/2/oauth2/token.

-- 1. twitter_sub — стабильный id юзера в Twitter/X.
alter table users add column twitter_sub varchar(64);
alter table users add constraint uk_users_twitter_sub unique (twitter_sub);

-- 2. oauth_state — таблица для хранения state и PKCE code_verifier между шагами OAuth.
--    Используется Twitter (а в будущем и любым другим Authorization Code провайдером).
--    TTL: 10 минут, дальше очищается по cron или просто игнорируется при lookup.
create table oauth_state (
    state          varchar(64)  primary key,
    provider       varchar(16)  not null,           -- 'TWITTER' (на будущее расширяемо)
    code_verifier  varchar(128) not null,
    -- Если это flow привязки к существующему юзеру (а не login) — кладём его userId.
    -- Иначе null = чистый login/register.
    link_user_id   uuid,
    expires_at     timestamp    not null,
    created_at     timestamp    not null default now()
);
create index idx_oauth_state_expires_at on oauth_state (expires_at);
