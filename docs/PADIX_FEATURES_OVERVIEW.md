# Padix — что готово в бэке и фронте

Сводный документ по продукту: используется как справочник при портировании на нативные **Android/iOS** клиенты. Описывает доменную модель, REST API, алгоритмы, фронтовые экраны, инфру и текущее состояние работ.

Последнее обновление: 2026-05-20.

> **Этот файл — single source of truth по фичам Padix.**
> Любая новая фича / изменение поведения на **любой** платформе (web / iOS / Android / бот) должны отражаться в этом документе в том же PR. См. раздел [«Правила для AI-сессий»](#правила-для-ai-сессий) ниже.

---

## 0. Bootstrap pack для новой сессии

Если ты открыл новую сессию и тебе сказали «делай Padix» — стартовый минимум, который позволит работать без раскопок:

1. **Этот документ** — общая картина, фичи, API, алгоритмы.
2. **`web/src/lib/api.ts`** — фактический контракт API в TypeScript (все типы, эндпойнты). Самый точный источник, обновляется вместе с фронтом.
3. **OpenAPI спецификация** — `http://localhost:8080/v3/api-docs` (JSON) и `http://localhost:8080/swagger-ui.html` (UI). Подтягивается из аннотаций `@Schema` / `@Operation` в бэке. Используй для кодогенерации мобильных клиентов.
4. **Дизайн-референс** — экраны `web/src/ui/v0/pages/V0*Page.tsx`. Это исходный дизайн, который копируем 1:1 на мобилку (тёмная тема, тот же layout, те же модалы, те же сворачиваемые секции).
5. **Память проекта** — `C:\Users\Administrator\.claude\projects\E--project\memory\MEMORY.md` — индекс памяти этой машины, включая правила работы.

---

## 0.1 Правила для AI-сессий

> Эти правила обязательны при работе над Padix — на любом стеке, в любой сессии. Они хранятся в auto-memory и подхватываются автоматически.

### A. Поддерживать этот документ

При **любом** изменении функционала Padix — web, мобилка (iOS/Android), bot — нужно в том же ходе обновить `docs/PADIX_FEATURES_OVERVIEW.md`:

- если фича готова на **одной** платформе и в плане на других — отметить это в матрице покрытия (см. ниже);
- если изменился контракт API, добавлен эндпойнт, изменилась схема БД — обновить разделы 3 (домен), 4–10 (API);
- если изменилась логика алгоритма (Elo / pairing / decay) — обновить раздел 9.

Документ — это не «снапшот», а живой контракт между сессиями и платформами. Без него следующая сессия будет переоткрывать решения, которые ты уже принял.

### B. Когда правишь фронтовый UI — делай и десктоп, и мобильную версию в одном изменении

Это **не** «поправить и потом проверить на мобильном». Это **«с самого начала проектируй и пишешь оба варианта»**.

- Любой layout/flex/grid класс — сразу думать, что будет на ≤640px. Tailwind responsive-модификаторы (`sm:`, `md:`) — не опциональны, они обязательны там, где раскладка меняется.
- После правки — проверять в `preview_resize` обе ширины: десктоп (~1280px) и мобильную (~390px). Скриншоты обеих в финальном отчёте.
- Кнопки и их иконки — на **одной стороне** (либо обе слева, либо обе справа), не разъезжаться при wrap.
- Когда появится нативное iOS/Android приложение — те же экраны и UX должны быть на нём, иначе матрица покрытия (раздел 12) расходится с реальностью.

### C. Прочие сквозные правила Padix

- **Подтверждения** — только через `useConfirm()` / `ConfirmProvider`, не `window.confirm`.
- **Тёмная тема** — все новые компоненты сразу с её поддержкой.
- **Не плодить новые миграции под выдуманные требования.** Если фича не запрошена явно — не добавляй колонку «на всякий».
- **Не вводить feature-flag-и и backwards-compatibility shim-ы**, если их явно не попросили. Менять код напрямую.

---

## 0.2 Рекомендуемый план мобильного клиента

### Рекомендуемый стек: **React Native (Expo) + TypeScript**

Почему именно он для Padix:

- **Готовый контракт.** `web/src/lib/api.ts` уже на TS — можно переиспользовать почти as-is (поправить только `fetch` базовый URL + Keychain/EncryptedSharedPreferences вместо `localStorage` для токена).
- **Одна команда** на iOS + Android.
- **Web → mobile** транзишн дешёвый: те же ментальные модели (компоненты, хуки), часть бизнес-логики страниц копируется почти напрямую.
- **Expo EAS** делает релизы в стор без чёрной магии Xcode/Gradle.

**Альтернативы:**
- **Kotlin Multiplatform (KMP) + Compose Multiplatform** — нативный фил, общая бизнес-логика. Подходит, если хочется ровно один язык с бэком (тут уже Kotlin), но UI пишется дольше.
- **Flutter** — быстрый прототип, но контракт нужно собирать заново.
- **Нативно (Swift + Kotlin)** — лучший UX, в 2× больше работы. Имеет смысл только если есть отдельные команды под обе платформы.

### MVP-набор экранов (фаза 1, ~2-3 недели на одного разработчика на RN)

1. **Login / Register / Survey** — `/api/auth/login|register`, `/api/survey/submit`. Без анкеты юзер не пускается дальше.
2. **Список игр** — `GET /api/events/upcoming?from&to` + календарный фильтр. Поддержать PRIVATE/PUBLIC видимость.
3. **Страница игры** — `GET /api/events/{id}`: раунды, матчи, регистрация, ввод счёта (черновой + итоговый), pull-to-refresh вместо polling.
4. **Профиль** — `GET /api/me`, история, рейтинг, график (LTTB downsample, тогглы периодов).
5. **Pop-уведомление ±delta** после игры — `GET /api/me/rating-notification` + `/seen`.

### Фаза 2 (после MVP)

6. Создание эвента (`POST /api/events`).
7. Друзья + приглашения (`/api/friends`, `/api/events/{id}/invite|add-friend`).
8. Топ рейтинга (`GET /api/players/rating`).
9. Telegram-привязка (`/api/telegram/*`).
10. Серии (`/api/event-series`).
11. Настройки профиля + аватар.

### Фаза 3

- Админка (опционально, можно оставить только в вебе).
- Push-уведомления (потребует расширения бэка: APNs/FCM-токены, broadcast).
- Возможный переход на WebSocket для real-time состояния матча.

### Дизайн

**Копируем 1:1 веб-страницы `V0*Page.tsx`.** Тёмная тема, ярко-зелёный/розовый акценты, иконки lucide-react (RN-аналог: `lucide-react-native`). Не «изобретаем мобильный UX заново» — берём те же layouts, адаптируем под нативные жесты (свайп для удаления, pull-to-refresh).

---

## 1. Что это за продукт

**Padix** — веб-приложение для организации любительских турниров «Американка» по падел-теннису. Один пользователь создаёт игру, приглашает участников, система:

- расставляет пары по корту в каждом раунде (две стратегии расстановки);
- ведёт счёт по матчам (сеты или очки);
- после финиша пересчитывает рейтинг ELO с поправками (margin, weak-strong, нормализация по числу матчей, калибровка, decay при бездействии);
- ведёт историю матчей, графики рейтинга, рейтинг лидеров;
- даёт социальные фичи (друзья, приглашения, мгновенное добавление друга);
- умеет рассылать события в Telegram-чаты;
- умеет создавать серии регулярных игр, из которых cron автоматически материализует обычные эвенты.

Доступ — через email/пароль. У пользователя есть `playerId` (доменный игрок) и `publicId` вида `#123456789` для добавления в друзья.

---

## 2. Стек и инфраструктура

| Слой | Технология |
|---|---|
| Бэкенд | Kotlin · Spring Boot 3.4 · Spring Data JPA · Spring Security · Flyway · OpenAPI / Swagger |
| Auth | JWT, отдельный admin-токен |
| БД | PostgreSQL 16 |
| Фронт | React 18 · TypeScript · Vite · Tailwind v4 · Radix UI · react-router-dom v7 |
| Сборка | Gradle (Kotlin DSL), отдельный модуль `bot` |
| Деплой | Docker Compose: `compose.dev.yml` (dev), `compose.yml` (prod) |
| Интеграции | Внешний `bot`-микросервис для Telegram (api проксирует через `/api/telegram/*`) |

Структура репо:

```
E:/project/padix/
├── api/                 ← Spring Boot бэк
│   └── src/main/kotlin/com/padelgo/{api,service,domain,repo,auth,admin,survey,config}
├── bot/                 ← отдельный микросервис Telegram-бота
├── web/                 ← React SPA
├── compose.dev.yml      ← dev-стек (db + api + web Vite)
├── compose.yml          ← prod-стек
└── docs/                ← API guide, QA ТЗ, этот документ
```

Порты dev-окружения:
- Web (Vite): `http://localhost:8083`
- API: `http://localhost:8080`
- PostgreSQL: `localhost:5432` (user/pass `padix/padix`)

---

## 3. Доменная модель и БД

### 3.1 Сущности (`api/src/main/kotlin/com/padelgo/domain/Entities.kt`, `SocialEntities.kt`)

| Таблица | Поля (ключевые) |
|---|---|
| `players` | `id`, `name` (unique), `rating` (Int, default 1000), `ntrp` (String — 1.0…5.0+), `gamesPlayed`, `avatarUrl`, `createdAt`, `lastMatchAt` |
| `users` | `id`, `email`, `passwordHash`, `playerId`, `publicId` (Long 9 цифр), `surveyCompleted`, `surveyLevel`, `disabled`, `calibrationMatchesRemaining`, `calibrationEventsRemaining` (legacy), `gender` (M/F/null) |
| `events` | `id`, `title`, `date`, `startTime`, `endTime`, `format` (AMERICANA), `pairingMode` (ROUND_ROBIN/BALANCED), `status` (DRAFT, OPEN_FOR_REGISTRATION, REGISTRATION_CLOSED, IN_PROGRESS, FINISHED, CANCELLED), `courtsCount`, `roundsPlanned`, `autoRounds`, `createdByUserId`, `scoringMode` (SETS/POINTS), `pointsPerPlayerPerMatch`, `setsPerMatch`, `gamesPerSet`, `tiebreakEnabled`, `visibility` (PRIVATE/PUBLIC), `seriesId`, `reminderSentAt`, `createdAt` |
| `event_courts` | `event_id`, `court_number`, `name` (произвольное название корта) |
| `event_series` | Шаблон регулярных игр: `daysOfWeek` ("MON,WED,FRI"), `startTime/endTime`, `timezone`, все параметры будущих эвентов, `materializeHoursBefore` (за сколько часов cron материализует игру), `active`, `lastMaterializedFor` |
| `registrations` | `event_id`, `player_id`, `status` (REGISTERED/CANCELLED), `cancelRequested`, `cancelApproved`, `cancelRequestedAt` |
| `rounds` | `event_id`, `roundNumber` |
| `matches` | `round_id`, `courtNumber`, 4 игрока (`teamA_p1`, `teamA_p2`, `teamB_p1`, `teamB_p2`), `status` (SCHEDULED/FINISHED) |
| `match_set_scores` | сеты, `setNumber`, `teamAGames`, `teamBGames` |
| `match_draft_scores` | черновой счёт матча: `teamAPoints`, `teamBPoints`, `updatedAt` |
| `rating_changes` | для истории: `eventId`, `matchId`, `playerId`, `oldRating`, `delta`, `newRating`, `createdAt` |
| `user_rating_notifications` | непрочитанные pop-уведомления о ±delta после игры |
| `friend_requests` | `fromUserId`, `toUserId`, `status` (PENDING/ACCEPTED/DECLINED) |
| `friends` | пара `userId` ↔ `friendUserId` |
| `event_invites` | `eventId`, `fromUserId`, `toUserId`, `status` (PENDING/ACCEPTED/DECLINED) |

### 3.2 Перечисления (`Enums.kt`)

```
EventFormat:           AMERICANA
PairingMode:           ROUND_ROBIN, BALANCED
ScoringMode:           SETS, POINTS
EventStatus:           DRAFT, OPEN_FOR_REGISTRATION, REGISTRATION_CLOSED, IN_PROGRESS, FINISHED, CANCELLED
RegistrationStatus:    REGISTERED, CANCELLED
MatchStatus:           SCHEDULED, FINISHED
FriendRequestStatus:   PENDING, ACCEPTED, DECLINED
InviteStatus:          PENDING, ACCEPTED, DECLINED
EventVisibility:       PRIVATE, PUBLIC
```

### 3.3 Миграции Flyway (`api/src/main/resources/db/migration`)

`V1..V36`. Кратко по эволюции:

- **V1** — стартовая схема (events, players, registrations, rounds, matches).
- **V2** — Match rules + set scores.
- **V3** — режим POINTS (очки) рядом с SETS.
- **V4** — таблица `users` (email/пароль), привязка к `players`.
- **V5..V6** — анкета (`surveyCompleted`, `surveyLevel`, payload).
- **V7** — калибровочные матчи (`calibrationMatchesRemaining`).
- **V8** — `auto_rounds` у эвента.
- **V9** — `created_by_user_id` (организатор).
- **V10** — заявки на отмену регистрации.
- **V11** — `end_time` у эвента.
- **V12** — `pairing_mode` (BALANCED режим).
- **V13** — `match_id` в `rating_changes`.
- **V14** — friends + invites.
- **V15** — `ntrp` у игрока.
- **V16** — `event_courts` (имена кортов).
- **V17** — флаг `disabled` у юзера.
- **V18** — `avatar_url` у игрока.
- **V19** — `match_draft_scores`.
- **V20** — `user_rating_notifications`.
- **V21** — `gender` у юзера.
- **V22** — calibrationMatchesRemaining как основной счётчик.
- **V23** — `last_match_at` у игрока (для decay).
- **V24** — `delta` в pop-уведомлении.
- **V25** — `telegram_integration` (таблицы для модуля).
- **V26** — `telegram_settings` (per-user preferences).
- **V27** — `visibility` (PRIVATE/PUBLIC) у эвента.
- **V28** — `event_series`.
- **V29** — `event_series.materialize_at_time` (точное время материализации).
- **V30** — pin announcement + weekly materialize у серий.
- **V31** — per-series настройки уведомлений.
- **V32** — `event_series_target_chats` (адресные TG-чаты у серий).
- **V33** — `match_set_scores.submitted_by_user_id` (кто ввёл счёт; используется при совместном вводе участниками).
- **V34** — `users.show_win_probability` (тоггл «Показывать шансы выигрыша», по умолчанию `FALSE`).
- **V35** — `feedback_tickets` (обратная связь, фаза 1 — fire-and-forget, см. §16).
- **V36** — `users.is_feedback_admin` (флаг «получаю TG-уведомления о новых тикетах», назначается в /admin).

---

## 4. Auth и профиль

### 4.1 Регистрация / вход
- `POST /api/auth/register` → `{token}`. Тело: `email`, `password` (≥6), `name`, `gender?`.
- `POST /api/auth/login` → `{token}`. JWT, передавать `Authorization: Bearer <token>`.

### 4.2 Профиль текущего пользователя
- `GET /api/me` → `MeResponse`: `email`, `playerId`, `name`, `rating`, `ntrp`, `gamesPlayed`, `publicId`, `surveyCompleted`, `surveyLevel`, `calibrationMatchesRemaining`, `avatarUrl`, `gender`.
- `PATCH /api/me/profile` → обновить любое из: `name`, `email`, `password`, `gender`.
- `PATCH /api/me/avatar` → загрузка аватара как `data:image/...;base64,...` (или `null`, чтобы удалить).
- `GET /api/me/history` → история игр (список `PlayerEventHistoryItem` с участниками, числом матчей, суммой очков, итоговым delta).
- `GET /api/me/history/{eventId}` → детали матчей внутри игры (для каждого: соперники, счёт, ±delta, isTeamA).
- `GET /api/me/rating-history` → точки для графика рейтинга (timestamp + rating, с привязкой к матчам).
- `GET /api/me/rating-notification` → последнее непрочитанное pop-уведомление о рейтинге (`{eventId, delta, newRating}` или `null`).
- `POST /api/me/rating-notification/{id}/seen` → отметить как прочитанное.

### 4.3 Анкета (`/api/survey`)
- `GET /api/survey/current` — текущая редакция вопросов (контент-определяемая, шкала 0.5–5.0).
- `POST /api/survey/submit` — отправить ответы. После этого выставляется `surveyCompleted = true` и `surveyLevel` (число), от которого стартует калибровочный рейтинг.

Пока анкета не пройдена, фронт перенаправляет на `/survey` (см. ниже).

---

## 5. События (игры)

Главный объект продукта. См. `api/src/main/kotlin/com/padelgo/api/Controllers.kt` и `service/EventService.kt`.

### 5.1 Жизненный цикл

```
DRAFT (зарезервировано) →
OPEN_FOR_REGISTRATION → REGISTRATION_CLOSED → IN_PROGRESS → FINISHED
                                          ↓
                                      CANCELLED (в любой момент)
```

- При создании эвент сразу в `OPEN_FOR_REGISTRATION`.
- Перед стартом обязателен набор: ≥ `courtsCount × 4` зарегистрированных.
- Старт — `POST /{id}/start`: формирует раунды по `PairingPlanner` и переводит в `IN_PROGRESS`.
- Финиш — `POST /{id}/finish`: считает рейтинг по `EloRating`, обновляет `players.rating`, пишет `rating_changes`, кладёт `user_rating_notifications`, помечает игрока `lastMatchAt`.

### 5.2 Эндпойнты эвентов (`/api/events`)

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/events` | Создать игру |
| `GET` | `/api/events/today` | Игры на сегодня (PRIVATE фильтруются по доступности) |
| `GET` | `/api/events/upcoming?from&to` | По диапазону дат (по умолчанию +14 дней) |
| `PATCH` | `/api/events/{id}` | Обновить: title, date, startTime, endTime, pointsPerPlayerPerMatch, courtsCount, pairingMode (только до старта) |
| `POST` | `/api/events/{id}/register` | Зарегистрировать игрока (по UUID) |
| `POST` | `/api/events/{id}/close-registration` | Перевести в REGISTRATION_CLOSED |
| `GET` | `/api/events/{id}/balance-preview` | Превью BALANCED-режима (макс. раундов без повторов в пределах cap) |
| `PATCH` | `/api/events/{id}/pairing-mode` | Сменить режим расстановки до старта |
| `POST` | `/api/events/{id}/cancel` | Самому отменить свою регистрацию (до старта — мгновенно, после — pending) |
| `POST` | `/api/events/{id}/cancel/{playerId}/approve` | Организатор подтверждает отмену |
| `POST` | `/api/events/{id}/remove/{playerId}` | Организатор удаляет игрока |
| `DELETE` | `/api/events/{id}` | Удалить игру (только организатор, до старта) |
| `POST` | `/api/events/{id}/start` | Стартовать игру (формирует раунды) |
| `POST` | `/api/events/matches/{matchId}/score` | Записать итоговый счёт матча (sets ИЛИ points). См. 5.5 — кто может вводить |
| `POST` | `/api/events/matches/{matchId}/draft-score` | Сохранить черновой счёт |
| `POST` | `/api/events/{id}/finish` | Завершить игру и пересчитать рейтинг |
| `POST` | `/api/events/{id}/rounds/add` | Добавить раунд вручную (autoRounds=false) |
| `POST` | `/api/events/{id}/rounds/final` | Добавить финальный раунд |
| `DELETE` | `/api/events/{id}/rounds/{roundId}` | Удалить последний пустой раунд |
| `GET` | `/api/events/{id}` | Детали игры (raounds + matches + scores + players + isAuthor) |

### 5.3 DTO основных ответов

`EventDetailsResponse`:
```
event:                EventResponse
rounds:               RoundResponse[]    // каждый раунд → matches[]
registeredPlayers:    PlayerResponse[]
pendingCancelRequests: PlayerResponse[]
isAuthor:             boolean
authorName:           string
```

`MatchResponse`:
```
id:                 UUID
courtNumber:        int
courtName:          string?       // из event_courts
teamA / teamB:      PlayerResponse[2]
status:             "SCHEDULED" | "FINISHED"
score:              { mode: SCORE_MODE, sets?: [...], points?: {teamAPoints,teamBPoints} } | null
submittedByUserId:  UUID?         // кто ввёл итоговый счёт (null = ещё не введён или старая запись до V33)
submittedByName:    string?       // имя игрока / email — для UI-метки «Введён: X»
expectedA:          double?       // 0..1, шанс победы команды A по Elo. null если матч уже сыгран (см. 5.6)
```

`PlayerResponse`:
```
id, name, rating, ntrp, gamesPlayed,
calibrationEventsRemaining (0 = откалиброван, >0 — ещё калибруется),
publicId ("#123456789"),
avatarUrl
```

### 5.4 Видимость

`visibility` ∈ {`PRIVATE`, `PUBLIC`}. Контроллер `today`/`upcoming` сначала тянет события, потом фильтрует через `service.filterVisibleFor(events, currentUserId)`:
- **PUBLIC** — видны всем.
- **PRIVATE** — только участникам / приглашённым / автору.

### 5.5 Авторизация ввода счёта (`POST /api/events/matches/{matchId}/score`)

Реализация: `EventService.submitScore` + миграция V33 + поле `MatchSetScore.submittedByUserId`.

| Кто | Когда | Что может |
|---|---|---|
| **Автор эвента** | `IN_PROGRESS` или `FINISHED` | Вводить, перезаписывать, редактировать после финиша |
| **Участник конкретного матча** (один из 4 игроков) | только `IN_PROGRESS` | Ввести счёт **один раз**, если ещё пусто |
| Участник эвента, но не этого матча | — | **403** |
| Не-автор | `FINISHED` | **403** |
| Не-автор, счёт уже введён (любым) | `IN_PROGRESS` | **409** `«Счёт уже введён. Изменить может только организатор.»` |

Фронт (`V0EventPage`): кнопка «Ввести счёт» при `IN_PROGRESS` показывается автору **и** любому участнику эвента. В модале раундов карточка матча, по которому уже введён счёт, окрашивается зелёным; не-автору кнопки команд `disabled` с подсказкой «Введён: <Имя>. Изменить может только организатор.». При клике на «Ввести счёт» не-автору авто-разворачивается раунд с его первым неввёденным матчем. На ошибке сохранения (включая 409 «гонка») вызывается `getEventDetails`, UI автоматически подтягивает актуальное состояние.

### 5.6 Шансы выигрыша, фаза 1

Реализация: миграция V34 + `users.show_win_probability` + `MatchResponse.expectedA` + Switch в Настройках профиля.

- `expectedA = EloRating.expectedScore(EloRating.teamRating(a1,a2), EloRating.teamRating(b1,b2))` — статичный расчёт в `EventController.getDetails`. Пока матч не сыгран. После `FINISHED` / `submittedByUserId != null` — `null` (есть фактический результат, шансы не показываем).
- В **Настройках профиля** (`V0SettingsPage`) — Switch «Показывать шансы выигрыша» с auto-save через `PATCH /api/me/profile { showWinProbability }`. По умолчанию `false`.
- В модале «Раунды» (`V0EventPage`) под `courtName` каждого неввёденного матча — компонент `WinProbabilityHint`: полоска `пАpct% : пBpct%` + текстовая метка по `abs(expectedA - 0.5)`:
  - `< 0.07` (≈ Δrating < 50) → «Равные шансы ⚖️»
  - `< 0.20` (≈ Δrating < 150) → «Лёгкий фаворит ← / →»
  - `< 0.34` (≈ Δrating < 300) → «Фаворит ← / →»
  - `< 0.45` (≈ Δrating < 500) → «Сильный фаворит ← / →»
  - иначе → «Битва Давида и Голиафа 🎭» (мягкая формулировка, чтобы не давить на аутсайдера)

**Фаза 2** (динамическая поправка по сегодняшней игре игрока) — отдельная задача #7 в roadmap.

---

## 6. Серии игр (EventSeries)

Шаблон регулярных игр. Cron материализует обычные эвенты из активной серии за `materializeHoursBefore` часов до старта.

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/event-series` | Создать серию |
| `GET` | `/api/event-series` | Мои серии |
| `GET` | `/api/event-series/{id}` | По ID |
| `PATCH` | `/api/event-series/{id}` | Обновить |
| `POST` | `/api/event-series/{id}/pause` | На паузу |
| `POST` | `/api/event-series/{id}/resume` | Возобновить |
| `DELETE` | `/api/event-series/{id}` | Удалить (созданные ею эвенты остаются) |

Тело создания: `title`, `daysOfWeek` ("MON,WED,FRI"), `startTime`, `endTime`, `timezone` (по умолчанию `Europe/Moscow`), `courtsCount`, `pairingMode`, `scoringMode`, `pointsPerPlayerPerMatch`, `visibility`, `materializeHoursBefore` (default 168 = 7 дней).

Логика материализации — `service/EventSeriesMaterializer.kt`.

---

## 7. Социальные фичи

Сервис `SocialService.kt`, контроллер `SocialController.kt` (`/api/...`).

### 7.1 Друзья
| Метод | Путь | Тело | Назначение |
|---|---|---|---|
| `POST` | `/api/friends/request` | `{publicId}` | Отправить заявку |
| `POST` | `/api/friends/accept` | `{publicId}` | Принять входящую |
| `POST` | `/api/friends/decline` | `{publicId}` | Отклонить входящую |
| `GET` | `/api/friends` | — | `{friends, incoming, outgoing}` |

### 7.2 Приглашения на игры
| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/events/{id}/invite` (body `{publicId}`) | Пригласить друга (с подтверждением) |
| `POST` | `/api/events/{id}/add-friend` (body `{publicId}`) | Автор добавляет друга **сразу** без подтверждения |
| `POST` | `/api/events/{id}/invites/accept` | Принять приглашение на эвент |
| `POST` | `/api/events/{id}/invites/decline` | Отклонить |
| `GET` | `/api/events/{id}/invites` | Кого пригласил текущий пользователь в этой игре |
| `GET` | `/api/invites` | Все входящие приглашения |

---

## 8. Telegram-интеграция

API служит прокси к отдельному `bot`-сервису. JWT валидируется на api, в bot уходит `X-Internal-Secret + X-User-Id`.

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/telegram/status` | Статус интеграции (`{enabled, botUsername}`) |
| `POST` | `/api/telegram/link-token` | Одноразовый токен и deeplink для привязки чата |
| `GET` | `/api/telegram/chats` | Привязанные чаты |
| `DELETE` | `/api/telegram/chats/{chatId}` | Отвязать |
| `GET` | `/api/telegram/settings` | Настройки уведомлений |
| `PATCH` | `/api/telegram/settings` | Обновить (`reminderHours`, `quietHoursStart/End`, `timezone`, `enabled`) |
| `PATCH` | `/api/telegram/chats/{chatId}/preferences` | Per-chat: `notifyUpdated`, `notifyFinished`, `notifyReminder` |

При создании эвента можно передать `telegramChatIds: UUID[]`, и в эти чаты автоматически уйдёт анонс через `BotClient.notifyEventCreated`. По окончании эвента — финальные результаты, перед началом — напоминание.

---

## 9. Алгоритмы

### 9.1 ELO рейтинг (`service/EloRating.kt`)

- **Expected score**: классическая формула `1 / (1 + 10^((B−A)/400))`.
- **K-factor** по `gamesPlayed`: <10 → 48, <30 → 32, ≥30 → 20.
- **Командный рейтинг пары**: weighted 60/40 в пользу **слабого**:
  ```
  teamRating = min × 0.6 + max × 0.4
  ```
  (В падле «бьют по слабому», поэтому пара 1800+1400 на деле слабее 1600+1600.)
- **Margin multiplier** — квадратичный, до ×1.5:
  ```
  ratio    = min(|teamAPoints − teamBPoints| / expectedTotal, 1)
  mult     = 1 + 0.5 × ratio²
  ```
  Примеры (expectedTotal=24): 13:11 → 1.003, 16:8 → 1.056, 20:4 → 1.22, 24:0 → 1.5.
- **Нормализация по матчам**: внутри одного эвента каждый игрок получает одинаковое суммарное «движение» вне зависимости от того, сколько раз сидел на замене (важно при нечётном составе и BALANCED).
- **Calibration boost ×1.5** пока `calibrationMatchesRemaining > 0`.
- **Decay** (`service/RatingDecay.kt`, cron `@Scheduled` в 03:00 UTC):
  - порог — 90 дней без матчей;
  - 1 очко в день в сторону `1500`;
  - cap = 30% от `|rating − 1500|`;
  - калибрующиеся игроки не трогаются.

### 9.2 Pairing (`service/PairingPlanner.kt`)

Lexicographic round cost. Сравнивается **по уровням** — нижестоящие критерии учитываются только при равенстве вышестоящих. Так штрафы не «съедают» друг друга.

Компоненты cost:
```
partnerRepeats     // ↓ повторов партнёрств
opponentRepeats    // ↓ повторов соперничеств
balanceViolations  // ↓ матчей с балансом > cap (только BALANCED)
totalBalance       // ↓ сумма |teamA − teamB| по матчам
courtRepeats       // ↓ повторов игрока на одном корте
withinPenalty      // ↓ внутри-командный disbalance
tieBreak           // ↓ случайный шум
```

Сравнители:
- **ROUND_ROBIN** — `partnerRepeats → opponentRepeats → balance...`
- **BALANCED** — `balanceViolations → totalBalance → partnerRepeats → opponentRepeats...`

Реализация: полный перебор разбиений с pruning на ≤3 кортах; жадный fallback на 4+ кортах.

Тесты `PairingSimulationTest`:
- 12 игроков × 3 корта × 6 раундов в ROUND_ROBIN — **0 повторов партнёрств**;
- 8×2 и 12×3 — стресс-сценарии на разные комбинации рейтингов.

### 9.3 Превью `BalancePreviewResponse`

Перед закрытием регистрации фронт зовёт `GET /balance-preview`, получает:
- `severity` (NONE/SMALL/MEDIUM/LARGE) по `ratingSpread`;
- `maxGoodRounds` — сколько раундов реально получится без повторов и нарушений cap.
Используется в модалке предупреждения «закрыть регистрацию».

---

## 10. Админка

Отдельный admin-токен. `POST /api/admin/login` принимает username/password из конфигурации `app.admin.username / app.admin.password`, возвращает админский JWT.

Эндпойнты:

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/admin/login` | Получить admin-токен |
| `POST` | `/api/admin/users` | Создать пользователя (с email, password, name, optional rating/ntrp/gender/calibration) |
| `GET` | `/api/admin/users` | Список всех пользователей (включая disabled) |
| `PATCH` | `/api/admin/users/{id}` | Обновить (email, name, password, disabled) |
| `DELETE` | `/api/admin/users/{id}` | «Удалить» — disabled=true, имя меняется на «Удалённый #publicId», email — на `deleted-...` |
| `POST` | `/api/admin/users/{id}/restore` | Восстановить (email + password обязательны) |
| `POST` | `/api/admin/complete-games?date=` | Утилита: добивает все эвенты на указанную дату до состояния FINISHED (для тестов) |

---

## 11. Фронтенд

### 11.1 Структура

```
web/src/
├── main.tsx
├── components/
│   ├── header.tsx                    ← актуальная шапка
│   ├── main-layout.tsx               ← MainLayout (использует header.tsx)
│   ├── landing-layout.tsx
│   ├── games-calendar.tsx
│   ├── player-tooltip.tsx
│   ├── rating-graph.tsx              ← график с периодами 7д/30д/3м/всё, LTTB downsample
│   ├── rating-notification-modal.tsx ← pop-модал ±delta после игры
│   ├── telegram-integration.tsx
│   └── ui/
│       ├── badge, button, card, dialog, input, label, select, tooltip
│       ├── confirm-dialog.tsx        ← ConfirmProvider + useConfirm()
│       ├── date-picker.tsx           ← DatePicker + TimePicker в теме сайта
│       └── modal-scroll-area.tsx
├── lib/api.ts                        ← API клиент + типы TS
└── ui/
    ├── App.tsx                       ← Routing + Providers + RatingNotification
    └── v0/pages/
        ├── V0LandingPage             ← публичный лендинг
        ├── V0LoginPage / V0RegisterPage
        ├── V0SurveyPage              ← анкета (после регистрации)
        ├── V0HomePage                ← дашборд авторизованного юзера
        ├── V0GamesPage               ← список игр (таблица + календарь)
        ├── V0EventPage               ← страница игры: регистрация / раунды / счёт / редактирование / удаление / +друзья
        ├── V0CreateEventPage         ← создание эвента (включая выбор Telegram-чатов и видимости)
        ├── V0ProfilePage             ← рейтинг, история, друзья, график
        ├── V0RatingPage              ← таблица лидеров с фильтрами
        ├── V0SettingsPage            ← настройки: профиль / Telegram / уведомления
        └── V0AdminPage               ← админка
```

Старый `ui/v0/V0Layout/V0Header` — **legacy**, не используется. Все страницы открываются через `MainLayout`.

### 11.2 Готовые UI-компоненты

- **ConfirmProvider** + `useConfirm()` — единый стиль подтверждений (вместо `window.confirm`).
- **ModalScrollArea** — кастомный scroll в модалах.
- **DatePicker / TimePicker** — popover в теме сайта (используется в создании эвента, фильтрах).
- **rating-graph** — переключатель периодов (7д/30д/3м/всё), toggle режима оси X (по матчам / по времени), LTTB downsample при >60 точках, выбор сохраняется в localStorage.
- **rating-notification-modal** — pop-модал после игры с зелёной/розовой плашкой ±delta.

### 11.3 Сделанные UX-улучшения

**Страница игры (V0EventPage):**
- Удалить / редактировать игру (только автор, со статус-логикой).
- Удалить раунд (с защитой от полностью сыгранных).
- Inline-клавиатура счёта под активным матчем.
- Якорь-сверху для скролла модала.
- Кастомный date/time picker в теме сайта.
- Кнопки иконками выровнены; сворачиваемая инфо-сводка на мобильном.
- Мгновенное добавление друга в эвент без подтверждения.

**Профиль (V0ProfilePage):**
- Сворачиваемые секции «Друзья» и «История матчей».
- max-height + scroll у списка друзей.
- Pop-модал ±delta после игры.
- График рейтинга с переключателями периода и режима оси.

**Header / Layout:**
- Гамбургер-меню на мобильном («Выйти» внутри — нельзя случайно).
- Тёмная тема, мобильная адаптация ключевых страниц.

---

## 12. Матрица покрытия и план

> Эта матрица — обязательная к обновлению при любом изменении фичи на любой платформе.
> Легенда: ✅ готово · 🟡 в работе · ⬜ не начато · — неприменимо.

| Фича | Бэк | Web | iOS | Android | Bot (TG) |
|---|---|---|---|---|---|
| Auth (email/пароль, JWT) | ✅ | ✅ | ⬜ | ⬜ | — |
| Анкета (survey) | ✅ | ✅ | ⬜ | ⬜ | — |
| Профиль (me + аватар + пол) | ✅ | ✅ | ⬜ | ⬜ | — |
| Список эвентов (today / upcoming) | ✅ | ✅ | ⬜ | ⬜ | ✅ (анонс) |
| Создание / редактирование эвента | ✅ | ✅ | ⬜ | ⬜ | — |
| Регистрация / самоотмена | ✅ | ✅ | ⬜ | ⬜ | — |
| Старт игры, раунды (auto/manual) | ✅ | ✅ | ⬜ | ⬜ | — |
| PairingPlanner (ROUND_ROBIN/BALANCED) | ✅ | — | — | — | — |
| Ввод счёта (черновой + итоговый, SETS/POINTS) | ✅ | ✅ | ⬜ | ⬜ | — |
| Совместный ввод счёта (участник своего матча, см. 5.5) | ✅ | ✅ | ⬜ | ⬜ | — |
| Шансы выигрыша, фаза 1 (Elo expectedScore + тоггл, см. 5.6) | ✅ | ✅ | ⬜ | ⬜ | — |
| Финиш игры + пересчёт Elo | ✅ | ✅ | ⬜ | ⬜ | ✅ (итоги) |
| Pop-уведомление ±delta | ✅ | ✅ | ⬜ | ⬜ | — |
| История игр / матчей | ✅ | ✅ | ⬜ | ⬜ | — |
| График рейтинга (LTTB + периоды) | ✅ | ✅ | ⬜ | ⬜ | — |
| Топ рейтинга (`/api/players/rating`) | ✅ | ✅ | ⬜ | ⬜ | — |
| Друзья (request/accept/decline) | ✅ | ✅ | ⬜ | ⬜ | — |
| Приглашения на эвент (+instant add) | ✅ | ✅ | ⬜ | ⬜ | — |
| Серии регулярных игр | ✅ | ✅ | ⬜ | ⬜ | — |
| Декей рейтинга (90д → 1500) | ✅ | — | — | — | — |
| Telegram: привязка чатов | ✅ | ✅ | ⬜ | ⬜ | ✅ |
| Telegram: per-chat preferences | ✅ | ✅ | ⬜ | ⬜ | ✅ |
| Telegram: напоминания/анонс/итоги | ✅ | — | — | — | ✅ |
| Видимость PRIVATE/PUBLIC | ✅ | ✅ | ⬜ | ⬜ | — |
| Админка (CRUD users, complete-games) | ✅ | ✅ | — | — | — |
| Обратная связь / тикеты (см. §16) | ✅ | ✅ | ⬜ | ⬜ | ✅ TG-нотификация админу (текст + медиа) |
| Push-уведомления | ⬜ | — | ⬜ | ⬜ | — |

### Готово (бэк + фронт)
- Auth: регистрация, вход, JWT, восстановление по admin, пол.
- Анкета (`surveyLevel`), стартовый рейтинг от анкеты.
- Создание / редактирование / удаление эвентов, видимость PRIVATE/PUBLIC.
- Регистрация на эвент (организатор), самоотмена с подтверждением.
- Авто-/ручные раунды, добавление финального раунда, удаление пустого раунда.
- PairingPlanner (ROUND_ROBIN + BALANCED) с lexicographic cost.
- Счёт: SETS (геймы/сеты с тайбрейком) и POINTS (американка), черновой счёт.
- ELO с командным 60/40, margin до ×1.5, нормализация по матчам, calibration ×1.5.
- Decay при бездействии (90 дней → drift к 1500, cron 03:00 UTC).
- Pop-уведомление о ±delta после игры (по `user_rating_notifications`).
- История матчей, история рейтинга, график.
- Друзья (request/accept/decline), приглашения (с подтверждением и instant-добавление).
- Серии регулярных игр + cron-материализация.
- Telegram-интеграция: привязка чатов, per-chat preferences, анонс эвента, напоминания, финальные результаты.
- Админка: CRUD пользователей, восстановление, force-complete игр на дату.
- 26 юнит-тестов (Elo, Decay, Pairing simulation).

### Запланировано (см. подробности в `MEMORY.md`)

| # | Задача | Объём |
|---|---|---|
| 6 | Роль тренера (`coach_players` + подтверждение рейтинга) | 🔥 1-2 дня |
| 7 | Шансы выигрыша, фаза 2 — динамическая поправка по сегодняшним играм | 🔥 1-2 дня |
| 8 | Другие режимы турнира (помимо «Американки»: round-robin с фиксированными парами, групповой + плей-офф, мексиканка) | 🔥 TBD |
| 9 | Ограничение по рейтингу при входе в эвент (min/max) | ⚡ 3-4ч |
| 10 | Доработка PRIVATE/PUBLIC: настройки видимости в листинге, поиск, кто видит участников | ⚡ 3-4ч |
| 11 | График: горизонтальный пан внутри периода | ⚡ 3-4ч |
| 12 | График: hover/tap-описание точек с деталями матча | ⚡ 2-3ч |
| 13 | Безопасность: refresh-токены, rate-limit, CORS, audit log, авторизация на эндпойнтах | 🔥 TBD |

---

## 16. Обратная связь / тикеты

Реализация: миграция V35 + `FeedbackTicket` entity + `FeedbackService` + `FeedbackController` + `FeedbackAdminController` + страницы `V0FeedbackPage` / `V0AdminFeedbackPage`.

**Модель (фаза 1, fire-and-forget — без статусов и переписки в аппе)**:
- Юзер шлёт тикет: `category` (BUG / FEATURE / QUESTION / OTHER) + `message` (5..5000 символов) + опц. вложение (фото или видео как data URL).
- Хранится в `feedback_tickets`. Авторизация: только залогиненные. Доступно даже до прохождения анкеты (см. SurveyGateFilter allowed-list).
- Ответ — внешним каналом (TG/email). Чтобы не плодить лишний UI — статусов нет, переписки в аппе нет.

**Эндпойнты**:
| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/api/feedback` | Создать тикет |
| `GET` | `/api/feedback/mine` | Свои тикеты (для UI «История обращений») |
| `GET` | `/api/admin/feedback` | Все тикеты (admin) |
| `DELETE` | `/api/admin/feedback/{id}` | Удалить тикет (admin) |

**Лимиты**: `message` 5..5000 символов; вложение data URL ≤ 7 MB (≈ 5 MB сырого бинарника). `server.tomcat.max-http-form-post-size: 16MB` в `application.yml`. Принимаются только `image/*` и `video/*` MIME.

**UI**:
- `/feedback` — страница «Обратная связь»: форма (4-карточные категории на десктопе, Select на мобильном) + textarea со счётчиком символов + drag-and-drop вложения + превью + список «Мои обращения».
- Точки входа: dropdown настроек в Header (десктоп) и мобильное меню (`MessageSquare` иконка).
- `/admin/feedback` — список всех тикетов с фильтрами по категории + поиск по имени/тексту, превью вложений (image/video инлайн), удаление с подтверждением. Ссылка из `/admin` в правом верхнем углу.

**Telegram-нотификация админу (фаза 2, готово)**:
- Назначение admin'ов — в **`/admin`**: для каждого юзера чекбокс «Feedback admin (TG)», auto-save. Под капотом — `users.is_feedback_admin` (миграция V36) + `AdminController.updateUser({ isFeedbackAdmin })`. Может быть несколько admin'ов одновременно — нотификация летит каждому.
- Чтобы юзер начал получать TG: войти под этим юзером → Настройки → Уведомления → Telegram → `/start` бота. Привязка хранится в `telegram_chat` (chat_type=PRIVATE).
- API: после сохранения тикета `FeedbackService.notifyAdmins()` берёт `users.findAllByIsFeedbackAdminTrue()` и для каждого зовёт `BotClient.notifyAdminFeedback(...)` fire-and-forget. Ошибки бота не валят транзакцию.
- Bot: `POST /api/internal/telegram/notify/admin-feedback` ищет PRIVATE-чат в `telegram_chat` по `adminUserId`, отправляет `sendMessage` с категорией + автором + полным текстом (≤3500 символов, HTML), затем — при наличии — `sendPhoto`/`sendVideo` через multipart-upload (бинарник декодируется из data URL на бот-стороне).
- Если у admin-юзера нет привязанного PRIVATE-чата — `sent=0`, в логе warning. Тикет всё равно сохраняется в `/admin/feedback`.

**Backlog (фаза 3, не сделано)**:
- Email-нотификация админу (когда нет TG).
- Rate-limit (n тикетов / сутки от одного юзера).
- Кнопка-ссылка «Открыть в админке» в TG-сообщении (нужен публичный URL приложения).

---

## 13. Что нужно знать для портирования на iOS / Android

1. **Аутентификация**
   - Везде `Authorization: Bearer <jwt>`. Токен — после `/api/auth/login`. Хранить в Keychain (iOS) / EncryptedSharedPreferences (Android).
   - Публичные эндпойнты: `GET /api/players/rating`, `GET /api/events/{id}` (без `isAuthor`), Swagger.

2. **Главные сценарии в порядке важности**
   1. Логин / регистрация / анкета.
   2. Список игр (`/api/events/upcoming`, фильтрация PRIVATE).
   3. Страница игры (`GET /api/events/{id}` → раунды/матчи/счёт).
   4. Регистрация на игру и instant-добавление друга.
   5. Ввод счёта матча (черновой + итоговый, с учётом `scoringMode`).
   6. Финиш игры → показать pop-модал ±delta (`/api/me/rating-notification`).
   7. Профиль: рейтинг, история, график (`/api/me/*`).
   8. Друзья и приглашения.
   9. Создание эвента / серии.
   10. Telegram-привязка (опционально).

3. **Доменные нюансы, которые легко упустить**
   - У игрока два «ID»: внутренний `playerId` (UUID, для регистрации в эвент) и `publicId` строкой `#123456789` (для friend-флоу).
   - `scoringMode` определяет, какое поле слать в `/score` — `sets[]` (с геймами) или `points` (одно значение на команду).
   - `pointsPerPlayerPerMatch × 4` = сумма очков двух команд в POINTS-режиме.
   - `calibrationMatchesRemaining > 0` — игрок ещё в калибровке (рейтинг меняется ×1.5).
   - `visibility = PRIVATE` — игра видна только участникам/приглашённым/автору. Для списков `/today` и `/upcoming` фильтрация уже выполнена на бэке для авторизованного пользователя.
   - `gender` опционален, для будущих фич (микс/женские турниры).
   - Аватар передаётся как `data:image/jpeg;base64,...`.

4. **OpenAPI**
   - Бэк генерит спецификацию через `springdoc-openapi`. Доступна по `/v3/api-docs` (JSON) и `/swagger-ui.html` (UI). Для нативных клиентов можно сгенерировать модели и клиент кодгеном.

5. **Локали / форматы**
   - Все даты — ISO (`yyyy-MM-dd`), время — `HH:mm`/`HH:mm:ss`, UTC для timestamp-ов. Все локализованные строки UI лежат на фронте (русский), бэк не локализует.

6. **Кейсы реального времени**
   - Real-time нет: фронт перезапрашивает `GET /api/events/{id}` после действий. Для мобильных приложений достаточно polling каждые N секунд на странице активной игры, либо переход на WebSocket в будущем.

---

## 14. Запуск, тесты, дев-стек

**Поднять полный dev-стек:**
```bash
cd /e/project/padix
docker-compose -f compose.dev.yml up -d --build
```
- Web (Vite, HMR): `http://localhost:8083`
- API: `http://localhost:8080`
- Swagger: `http://localhost:8080/swagger-ui.html`
- DB: `localhost:5432` (padix/padix)

**Перебилд бэка:**
```bash
docker-compose -f compose.dev.yml up -d --build api
```

**Юнит-тесты:**
```bash
docker run --rm -v "//e/project/padix:/app" -w //app gradle:8.7-jdk21 \
  sh -c 'gradle --no-daemon test'
```

Покрытие: `EloRatingTest`, `RatingDecayTest`, `PairingSimulationTest` (8×2 и 12×3, 6 раундов).

---

## 15. Ссылки на ключевые файлы

### Бэк
- [Controllers.kt](api/src/main/kotlin/com/padelgo/api/Controllers.kt) — REST по эвентам
- [Dto.kt](api/src/main/kotlin/com/padelgo/api/Dto.kt) — DTO с описаниями для Swagger
- [SocialController.kt](api/src/main/kotlin/com/padelgo/api/SocialController.kt) — друзья и приглашения
- [EventSeriesController.kt](api/src/main/kotlin/com/padelgo/api/EventSeriesController.kt) — серии
- [TelegramProxyController.kt](api/src/main/kotlin/com/padelgo/api/TelegramProxyController.kt) — Telegram прокси
- [AuthController.kt](api/src/main/kotlin/com/padelgo/auth/AuthController.kt) — регистрация / профиль
- [AdminController.kt](api/src/main/kotlin/com/padelgo/admin/AdminController.kt) — админка
- [SurveyController.kt](api/src/main/kotlin/com/padelgo/survey/SurveyController.kt) — анкета
- [EventService.kt](api/src/main/kotlin/com/padelgo/service/EventService.kt) — основной бизнес
- [EloRating.kt](api/src/main/kotlin/com/padelgo/service/EloRating.kt) — формулы рейтинга
- [PairingPlanner.kt](api/src/main/kotlin/com/padelgo/service/PairingPlanner.kt) — расстановка пар
- [RatingDecay.kt](api/src/main/kotlin/com/padelgo/service/RatingDecay.kt) — затухание
- [EventSeriesService.kt](api/src/main/kotlin/com/padelgo/service/EventSeriesService.kt) и [EventSeriesMaterializer.kt](api/src/main/kotlin/com/padelgo/service/EventSeriesMaterializer.kt)
- [SocialService.kt](api/src/main/kotlin/com/padelgo/service/SocialService.kt)
- [Entities.kt](api/src/main/kotlin/com/padelgo/domain/Entities.kt) / [SocialEntities.kt](api/src/main/kotlin/com/padelgo/domain/SocialEntities.kt) / [Enums.kt](api/src/main/kotlin/com/padelgo/domain/Enums.kt)
- Миграции — `api/src/main/resources/db/migration/V1__init.sql` … `V28__event_series.sql`

### Фронт
- [App.tsx](web/src/ui/App.tsx) — routing + providers
- [main-layout.tsx](web/src/components/main-layout.tsx) / [header.tsx](web/src/components/header.tsx)
- [api.ts](web/src/lib/api.ts) — клиент + TS-типы (можно использовать как «контракт» для генерации мобильных клиентов)
- [V0EventPage.tsx](web/src/ui/v0/pages/V0EventPage.tsx) — страница игры
- [V0CreateEventPage.tsx](web/src/ui/v0/pages/V0CreateEventPage.tsx)
- [V0ProfilePage.tsx](web/src/ui/v0/pages/V0ProfilePage.tsx)
- [V0RatingPage.tsx](web/src/ui/v0/pages/V0RatingPage.tsx)
- [V0GamesPage.tsx](web/src/ui/v0/pages/V0GamesPage.tsx)
- [V0SettingsPage.tsx](web/src/ui/v0/pages/V0SettingsPage.tsx)
- [V0AdminPage.tsx](web/src/ui/v0/pages/V0AdminPage.tsx)
- [rating-graph.tsx](web/src/components/rating-graph.tsx) / [rating-notification-modal.tsx](web/src/components/rating-notification-modal.tsx)

### Существующие гайды
- [docs/PadelGo_API_Android_Guide.md](docs/PadelGo_API_Android_Guide.md) — расширенный API-гайд с примерами для Android (предшественник этого документа)
- [docs/TESTING.md](docs/TESTING.md), [docs/DOCKER_GUIDE.md](docs/DOCKER_GUIDE.md)
- [docs/QA_ТЗ_для_тестирования.md](docs/QA_ТЗ_для_тестирования.md)
