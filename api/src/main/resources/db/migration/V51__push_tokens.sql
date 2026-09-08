-- Сбор push-токенов устройств (FCM для Android, APNs-через-FCM для iOS, web-push).
-- Клиент шлёт токен на POST /api/push/tokens после логина и при каждом обновлении
-- токена самим Firebase (onNewToken / getToken после переустановки, очистки данных,
-- восстановления из бэкапа). Рассылка уведомлений — отдельная задача, здесь только приём.
create table push_tokens (
    id           uuid         primary key,
    -- Внутренний ID пользователя: по нему потом выбираются адресаты рассылки.
    -- ON DELETE CASCADE — токен без владельца бесполезен.
    user_id      uuid         not null references users(id) on delete cascade,
    -- FCM-регистрационные токены сейчас ~160-200 символов, но длина не документирована
    -- и исторически росла — берём с запасом.
    token        varchar(512) not null,
    platform     varchar(16)  not null
        constraint chk_push_tokens_platform check (platform in ('ANDROID', 'IOS', 'WEB')),
    -- Стабильный идентификатор установки (Expo installationId / ANDROID_ID и т.п.).
    -- Нужен, чтобы при ротации токена выкинуть прошлый токен того же устройства,
    -- иначе на один телефон копятся мёртвые записи. Необязателен: клиент может не прислать.
    device_id    varchar(128),
    -- Паспорт устройства. Собираем в момент регистрации токена, потому что при рассылке
    -- взять его будет неоткуда — клиента рядом нет:
    --  * app_version / os_* / device_model — разбор «почему на этих телефонах не доставляется»
    --    и отсечение старых сборок при постепенной раскатке;
    --  * locale — на каком языке слать текст пуша;
    --  * timezone — чтобы не будить человека ночью (тихие часы, как в Telegram-настройках).
    app_version  varchar(32),
    device_model varchar(128),
    os_name      varchar(32),
    os_version   varchar(32),
    locale       varchar(16),
    timezone     varchar(64),
    created_at   timestamp    not null default now(),
    -- Время последней регистрации токена клиентом: и «токен ещё живой» (клиент
    -- перерегистрирует его при каждом запуске), и точка отсчёта для чистки протухших.
    updated_at   timestamp    not null default now()
);

-- Токен уникален глобально: один и тот же токен не может принадлежать двум юзерам.
-- Если на устройстве сменился аккаунт — строка переезжает на нового владельца (upsert).
create unique index idx_push_tokens_token on push_tokens (token);
create index idx_push_tokens_user_id on push_tokens (user_id);
create index idx_push_tokens_user_device on push_tokens (user_id, device_id);
