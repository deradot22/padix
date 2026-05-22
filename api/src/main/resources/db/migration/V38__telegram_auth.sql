-- Telegram Login Widget — авторизация через Telegram.
-- Это ОТДЕЛЬНАЯ фича от существующей integration через telegram_chat (для нотификаций):
-- telegram_chat.chat_id — куда отправлять сообщения, может быть группой/каналом;
-- users.telegram_user_id — глобальный ID пользователя в Telegram для аутентификации.
--
-- Также готовимся к OAuth-провайдерам где может не быть email (Telegram, Twitter):
-- email и password_hash становятся nullable.

-- 1. Email теперь nullable: Telegram логин не отдаёт email, юзер может его добавить позже в настройках.
--    Существующая UNIQUE-constraint на email продолжит работать корректно — в PostgreSQL NULL-значения
--    не считаются равными, поэтому несколько NULL допустимы.
alter table users alter column email drop not null;

-- 2. password_hash — nullable для OAuth-only юзеров (зарегались через Telegram, пароль не задавали).
--    Login по паролю для таких юзеров не сработает — но они входят через свой провайдер.
alter table users alter column password_hash drop not null;

-- 3. Telegram user ID — числовой ID юзера в Telegram. Уникален глобально.
alter table users add column telegram_user_id bigint;
alter table users add constraint uk_users_telegram_user_id unique (telegram_user_id);

-- 4. Полезные мета-поля от Telegram (необязательные — могут быть null).
--    @username (может отсутствовать у юзера) и URL аватара (если есть public profile photo).
alter table users add column telegram_username varchar(64);
alter table users add column telegram_photo_url varchar(512);
