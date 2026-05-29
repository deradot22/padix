-- Google Sign-In: привязка аккаунта к Google-юзеру через OAuth2 ID-token.
-- При успешной авторизации в Google фронт получает credential (JWT), отправляет на /api/auth/google,
-- бэк проверяет подпись через https://oauth2.googleapis.com/tokeninfo и достаёт sub (Google user ID).

-- google_sub — стабильный уникальный идентификатор юзера в Google. Не меняется даже если юзер
-- сменит email/имя в своём Google-аккаунте. Лучше чем email для связывания.
alter table users add column google_sub varchar(255);
alter table users add constraint uk_users_google_sub unique (google_sub);
