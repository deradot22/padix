-- Decay теперь пишет запись в историю рейтинга (раньше молча менял players.rating,
-- из-за чего на графике рейтинга возникали необъяснимые скачки).
-- У decay-записей нет эвента/матча → event_id становится nullable, добавляется kind.
alter table rating_changes alter column event_id drop not null;
alter table rating_changes add column kind varchar(16) not null default 'MATCH';
