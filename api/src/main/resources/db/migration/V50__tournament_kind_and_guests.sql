-- Турниры: отдельный вид события, который не влияет на рейтинг.
-- Гости: участники, вписанные организатором вручную (без аккаунта);
-- исключаются из общего рейтинг-лидерборда и decay.
alter table events
    add column kind varchar(16) not null default 'REGULAR'
        constraint chk_events_kind check (kind in ('REGULAR', 'TOURNAMENT'));

alter table players
    add column is_guest boolean not null default false;
