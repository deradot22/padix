-- Дискриминатор типа поста в event_telegram_post:
--   'ANNOUNCE' — CREATED-анонс игры (редактируется при изменении состава, пиннится,
--                снимается/редактируется при отмене);
--   'RESULTS'  — итоговый пост о завершённой игре (для editMessageText при пересчёте
--                результатов через updateEventResults).
-- Существующие строки (только анонсы — итоговый пост раньше не сохранялся) получают 'ANNOUNCE'.
alter table event_telegram_post add column post_kind varchar(16) not null default 'ANNOUNCE';
