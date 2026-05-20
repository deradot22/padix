-- Дельта рейтинга в уведомлении — чтобы фронт показывал +X / -X.
alter table user_rating_notifications add column delta integer not null default 0;
