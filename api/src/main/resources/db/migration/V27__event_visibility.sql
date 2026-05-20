-- Видимость игры: PRIVATE (только автор/участники/приглашённые) или PUBLIC (видна всем на /games).
-- Существующие игры мигрируют в PRIVATE — это самый безопасный пресет: если автор хочет
-- открыть свою игру, он сделает это явно.
alter table events
    add column visibility varchar(16) not null default 'PRIVATE'
        constraint chk_events_visibility check (visibility in ('PRIVATE', 'PUBLIC'));
