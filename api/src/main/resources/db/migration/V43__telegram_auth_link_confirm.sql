-- Подтверждение привязки Telegram к существующему email-аккаунту через email-link.
-- Используется когда юзер в bot-login форме вбил email, который УЖЕ есть в users.
-- Чтобы избежать хищения аккаунта (атакующий регает свой TG с чужим email),
-- мы шлём confirmation-link на этот email; только владелец почты сможет открыть и нажать.
--
-- email_confirm_token — короткий секрет в URL подтверждения. SHA-256 хэш в БД (как у /verify-email).
-- email_confirm_target_user_id — кому привязать TG если confirm пройдёт.
alter table telegram_auth_token add column email_confirm_token_hash varchar(64);
alter table telegram_auth_token add column email_confirm_target_user_id uuid;
alter table telegram_auth_token add column email_confirm_sent_to varchar(255);

-- Новый статус: AWAITING_EMAIL_CONFIRM — между APPROVED (бот подтвердил) и финальной выдачей JWT.
-- Юзер ждёт письма и кликает по ссылке.
comment on column telegram_auth_token.status is
    'PENDING → AWAITING_APPROVAL → APPROVED → (опционально AWAITING_EMAIL_CONFIRM при email collision) → CONSUMED';
