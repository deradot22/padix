-- Поле для bot-link flow: какой user_id привязывает Telegram (из JWT при /bot-link/start).
-- В отличие от email_confirm_target_user_id, который заполняется ПОЗЖЕ (когда юзер на complete
-- ввёл existing email), link_target_user_id известен СРАЗУ — юзер уже залогинен.
alter table telegram_auth_token
    add column link_target_user_id uuid;
