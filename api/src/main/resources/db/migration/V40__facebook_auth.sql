-- Facebook Sign-In: привязка по стабильному Facebook user ID.
-- Фронт получает access_token от FB JS SDK, шлёт на /api/auth/facebook;
-- бэк через https://graph.facebook.com/debug_token верифицирует токен (проверяет что выпущен для нашего app)
-- и через https://graph.facebook.com/me забирает {id, email, first_name, last_name, picture}.

alter table users add column facebook_sub varchar(64);
alter table users add constraint uk_users_facebook_sub unique (facebook_sub);
