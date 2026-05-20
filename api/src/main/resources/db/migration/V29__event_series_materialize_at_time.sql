-- Чтобы анонсы регулярных игр не падали участникам в случайное время суток
-- (в т.ч. ночью), у серии добавляется поле "время анонса". Материализатор будет
-- триггерить создание Event только когда локальное время автора в окне
-- [materialize_at_time, materialize_at_time + 1h).
alter table event_series
    add column materialize_at_time time not null default '09:00:00';
