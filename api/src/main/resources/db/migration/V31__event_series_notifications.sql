-- Per-series настройки уведомлений: переопределяют глобальные telegram_user_settings
-- только для events, материализованных из этой серии. Одноразовые (single) events
-- продолжают использовать глобальные настройки.

-- reminder_hours: за сколько часов до начала шлём напоминание участникам.
-- NULL = брать из telegram_user_settings.reminder_hours (global default).
alter table event_series
    add column reminder_hours integer null;

alter table event_series
    add constraint chk_event_series_reminder_hours
    check (reminder_hours is null or reminder_hours between 0 and 168);

-- pin_announcement: закреплять анонс новой игры этой серии в групповых чатах.
-- NULL = брать из telegram_user_settings.pin_announcement (global default).
alter table event_series
    add column pin_announcement boolean null;
