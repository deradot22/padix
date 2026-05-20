-- Серии игр: шаблон, по которому cron-материализатор раз в час создаёт обычные events.
-- days_of_week — CSV из коротких имён ISO-дней (MON, TUE, WED, THU, FRI, SAT, SUN).
-- last_materialized_for — последняя дата, для которой уже создан event (защита от дубликатов).
create table event_series (
    id                          uuid primary key,
    title                       varchar(255) not null,
    created_by_user_id          uuid references users(id) on delete set null,
    days_of_week                varchar(64) not null,
    start_time                  time not null,
    end_time                    time not null,
    timezone                    varchar(64) not null default 'Europe/Moscow',
    courts_count                integer not null default 2,
    rounds_planned              integer not null default 6,
    auto_rounds                 boolean not null default true,
    pairing_mode                varchar(32) not null default 'ROUND_ROBIN',
    scoring_mode                varchar(32) not null default 'POINTS',
    points_per_player_per_match integer not null default 6,
    sets_per_match              integer not null default 1,
    games_per_set               integer not null default 6,
    tiebreak_enabled            boolean not null default true,
    visibility                  varchar(16) not null default 'PRIVATE'
        constraint chk_event_series_visibility check (visibility in ('PRIVATE', 'PUBLIC')),
    materialize_hours_before    integer not null default 168
        constraint chk_event_series_materialize_hours check (materialize_hours_before between 1 and 720),
    active                      boolean not null default true,
    last_materialized_for       date,
    created_at                  timestamp not null default now(),
    updated_at                  timestamp not null default now()
);

create index idx_event_series_active on event_series(active) where active = true;
create index idx_event_series_owner on event_series(created_by_user_id);

-- Связь event → series. on delete set null, чтобы при удалении серии существующие игры
-- продолжали жить (просто теряют связь с шаблоном).
alter table events
    add column series_id uuid references event_series(id) on delete set null;

create index idx_events_series on events(series_id) where series_id is not null;
