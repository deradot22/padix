# PadelGo API
## Руководство для Android разработчиков

**Версия 1.0**

---

## Содержание

1. [Основная информация](#основная-информация)
2. [Аутентификация и токены](#аутентификация-и-токены)
3. [Профиль](#профиль)
4. [Игроки](#игроки)
5. [Игры (События)](#игры-события)
6. [Социальные функции](#социальные-функции)
7. [Коды ошибок](#коды-ошибок)
8. [Практические советы](#практические-советы)

---

## Основная информация

**Base URL:** `https://api.padix.club`

**Примеры полных URL:**
```
https://api.padix.club/api/auth/register
https://api.padix.club/api/auth/login
https://api.padix.club/api/players/rating
https://api.padix.club/api/events/today
https://api.padix.club/api/me
```

### Аутентификация

Все защищённые endpoints требуют JWT токен в заголовке Authorization:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJwbGF5ZXJJZCI6IjEyMzQ1Njc4LTEyMzQtNTY3OC1hYmNkLWVmZ2hpamtsbW5vIiwiYWRtaW4iOmZhbHNlLCJpYXQiOjE3NDY0MDAwMDAsImV4cCI6MTc0NjQwMzYwMH0.signature
```

### Форматы данных

- Все запросы и ответы в JSON
- Даты в формате ISO 8601: `2026-05-01`
- Время в формате HH:mm: `14:30`
- UUID в стандартном формате
- Email используется как логин/уникальный идентификатор пользователя

---

## Аутентификация и токены

### JWT токен (Bearer Token)

**Структура JWT токена:**

JWT токен состоит из 3 частей, разделённых точками: `header.payload.signature`

**Пример полного токена:**
```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJwbGF5ZXJJZCI6IjEyMzQ1Njc4LTEyMzQtNTY3OC1hYmNkLWVmZ2hpamtsbW5vIiwiYWRtaW4iOmZhbHNlLCJpYXQiOjE3NDY0MDAwMDAsImV4cCI6MTc0NjQwMzYwMH0.signature
```

**Payload (декодированный):**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",    // userId (UUID)
  "email": "user@example.com",                       // Email пользователя
  "playerId": "12345678-1234-5678-abcd-efghijklmno", // UUID игрока
  "admin": false,                                    // Админ флаг
  "iat": 1746400000,                                 // Время выдачи токена
  "exp": 1749078000                                  // Время истечения (30 дней)
}
```

**Где использовать токен:**
- В заголовке каждого защищённого запроса: `Authorization: Bearer <token>`
- Токен действует 30 дней (по умолчанию)
- При ошибке 401 токен истёк или невалиден — требуется новый вход
- Пользователь может быть залогинен 30 дней без повторного входа

**Нет дополнительных API ключей** — используется только JWT токен из аутентификации.

### Срок действия токена (TTL)

**По умолчанию:** 30 дней (2 592 000 секунд)

Это означает:
- Пользователь может быть залогинен **30 дней** без повторного входа
- Токен автоматически истекает через 30 дней
- При попытке использовать истёкший токен приложение получит ошибку `401 Unauthorized`
- Тогда пользователю нужно заново войти через `/api/auth/login`

**Переменная окружения:** `APP_JWT_TTL_SECONDS` (в секундах)

Если нужна другая длительность, можно установить переменную окружения, например:
- `APP_JWT_TTL_SECONDS=3600` — 1 час
- `APP_JWT_TTL_SECONDS=86400` — 1 день
- `APP_JWT_TTL_SECONDS=2592000` — 30 дней (по умолчанию)

### Регистрация

**POST https://api.padix.club/api/auth/register**

Создание нового аккаунта и получение JWT токена

| Параметр | Тип | Обязателен | Описание |
|----------|-----|-----------|---------|
| email | string | Да | Email пользователя (используется как логин, уникален) |
| password | string | Да | Пароль (минимум 6 символов) |
| name | string | Да | Имя игрока (как его видят другие игроки) |
| gender | string | Нет | Пол: `M` — мужской, `F` — женский, `null` — не указан |

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player@example.com",
    "password": "MySecurePass123",
    "name": "Алексей Иванов",
    "gender": "M"
  }'
```

**Ответ (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InBsYXllckBleGFtcGxlLmNvbSIsInBsYXllcklkIjoiMTIzNDU2NzgtMTIzNC01Njc4LWFiY2QtZWZnaGlqa2xtbm8iLCJhZG1pbiI6ZmFsc2UsImlhdCI6MTc0NjQwMDAwMCwiZXhwIjoxNzQ2NDAzNjAwfQ.signature"
}
```

**Код ошибок:**
- `400` — Email уже зарегистрирован или пароль слишком короткий
- `422` — Неверный формат email

### Вход

**POST https://api.padix.club/api/auth/login**

Вход в существующий аккаунт и получение JWT токена

| Параметр | Тип | Описание |
|----------|-----|---------|
| email | string | Email (логин) пользователя |
| password | string | Пароль |

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player@example.com",
    "password": "MySecurePass123"
  }'
```

**Ответ (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InBsYXllckBleGFtcGxlLmNvbSIsInBsYXllcklkIjoiMTIzNDU2NzgtMTIzNC01Njc4LWFiY2QtZWZnaGlqa2xtbm8iLCJhZG1pbiI6ZmFsc2UsImlhdCI6MTc0NjQwMDAwMCwiZXhwIjoxNzQ2NDAzNjAwfQ.signature"
}
```

**Коды ошибок:**
- `401` — Неверный email или пароль
- `400` — Поле email или password отсутствует

---

## Профиль

### Получить профиль

**GET https://api.padix.club/api/me**

Получить информацию профиля текущего авторизованного пользователя

**Требует токен:** Да ✓

**Заголовки запроса:**
```
Authorization: Bearer <your_jwt_token>
```

**Пример запроса:**
```bash
curl -X GET https://api.padix.club/api/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...."
```

**Ответ (200 OK):**
```json
{
  "email": "user@example.com",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "John Doe",
  "rating": 1850,
  "ntrp": "3.5",
  "gamesPlayed": 24,
  "publicId": "#123456789",
  "surveyCompleted": true,
  "surveyLevel": 3.5,
  "calibrationMatchesRemaining": 0,
  "avatarUrl": "https://api.padix.club/avatars/user123.jpg",
  "gender": "M"
}
```

**Поля ответа:**
- `email` — Email пользователя (логин)
- `playerId` — UUID игрока (используется для регистрации на игры)
- `name` — Имя, видимое другим игрокам
- `rating` — ELO рейтинг
- `ntrp` — Уровень навыков (1.0–5.0+)
- `gamesPlayed` — Всего сыграно матчей
- `publicId` — Публичный ID для добавления в друзья (формат `#123456789`)
- `surveyCompleted` — Прошёл ли пользователь первичную анкету
- `surveyLevel` — Уровень из анкеты (0.5–5.0) или `null`
- `calibrationMatchesRemaining` — Осталось матчей для завершения калибровки (0 = завершена)
- `avatarUrl` — URL аватара пользователя
- `gender` — Пол (M/F) или null

### Обновить профиль

**PATCH https://api.padix.club/api/me/profile**

Обновить данные профиля (передавай только поля, которые нужно изменить)

**Требует токен:** Да ✓

| Параметр | Тип | Описание |
|----------|-----|---------|
| name | string | Новое имя (опционально) |
| email | string | Новый email/логин (опционально, должен быть уникален) |
| password | string | Новый пароль (опционально) |
| gender | string | Пол: M или F (опционально) |

**Пример запроса (изменить имя и пол):**
```bash
curl -X PATCH https://api.padix.club/api/me/profile \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Алексей Петров",
    "gender": "M"
  }'
```

### Обновить аватар

**PATCH https://api.padix.club/api/me/avatar**

Загрузить или удалить аватар пользователя

**Требует токен:** Да ✓

| Параметр | Тип | Описание |
|----------|-----|---------|
| avatarDataUrl | string | Data URL изображения в Base64 (например: `data:image/jpeg;base64,...`) или `null` чтобы удалить |

**Поддерживаемые форматы:** JPEG, PNG  
**Максимальный размер:** ~2MB

**Пример запроса:**
```bash
curl -X PATCH https://api.padix.club/api/me/avatar \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "avatarDataUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDA..."
  }'
```

### История игр

**GET /api/me/history**

Получить историю игр (список событий с итогами)

**Требует токен:** Да

### История рейтинга

**GET /api/me/rating-history**

Получить историю изменений рейтинга (точки для графика)

**Требует токен:** Да

### Уведомления о рейтинге

**GET /api/me/rating-notification**

Получить последнее непрочитанное уведомление об изменении рейтинга

**Требует токен:** Да

---

## Игроки

### Список игроков по рейтингу

**GET /api/players/rating**

Получить список всех игроков отсортированный по рейтингу (убывание)

**Требует токен:** Нет (публичный endpoint)

**Ответ (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "rating": 1850,
    "ntrp": "3.5",
    "gamesPlayed": 24,
    "calibrationEventsRemaining": 0,
    "publicId": "#123456789",
    "avatarUrl": "https://..."
  },
  ...
]
```

#### Поля игрока

| Поле | Тип | Описание |
|------|-----|---------|
| id | UUID | Уникальный идентификатор игрока |
| name | string | Имя игрока |
| rating | integer | Рейтинг ELO |
| ntrp | string | Уровень NTRP: 1.0, 1.5, 2.0, ..., 5.0+ |
| gamesPlayed | integer | Количество сыгранных матчей |
| calibrationEventsRemaining | integer | Матчей до конца калибровки (null = недоступно) |
| publicId | string | Публичный ID формата #123456789 |
| avatarUrl | string | URL аватара |

---

## Игры (События)

### Создать игру

**POST https://api.padix.club/api/events**

Создать новую игру. Создатель становится организатором. Игра создаётся со статусом `OPEN_FOR_REGISTRATION`.

**Требует токен:** Да ✓

**Параметры запроса (body):**

| Параметр | Тип | Обязателен | По умолчанию | Описание |
|----------|-----|-----------|------------|---------|
| `title` | string | Да | — | Название игры (не пустое) |
| `date` | string | Да | — | Дата (YYYY-MM-DD), не может быть в прошлом |
| `startTime` | string | Да | — | Время начала (HH:mm) |
| `endTime` | string | Да | — | Время окончания (HH:mm). Если ≤ `startTime` — игра переходит за полночь |
| `format` | enum | Нет | `AMERICANA` | Формат игры. Возможные: `AMERICANA` |
| `pairingMode` | enum | Нет | `ROUND_ROBIN` | Режим расстановки. Возможные: `ROUND_ROBIN`, `BALANCED` |
| `courtsCount` | integer | Нет | `2` | Количество кортов (>= 1). Вместимость = `courtsCount × 4` игроков |
| `courtNames` | array | Нет | Авто-генерация ("Корт A", "Корт B"…) | Названия кортов. Размер должен совпадать с `courtsCount` |
| `autoRounds` | boolean | Нет | `true` | Автоматическое создание раундов при старте игры |
| `roundsPlanned` | integer | Нет | `6` | Количество раундов (используется при `autoRounds=false`) |
| `scoringMode` | enum | Нет | `SETS` | Система счёта. Возможные: `SETS`, `POINTS` |
| `pointsPerPlayerPerMatch` | integer | Нет | `6` | Очков на игрока за матч (для `POINTS`). Сумма очков = `pointsPerPlayerPerMatch × 4` |
| `setsPerMatch` | integer | Нет | `1` | Сетов в матче (для `SETS`) |
| `gamesPerSet` | integer | Нет | `6` | Геймов в сете (для `SETS`) |
| `tiebreakEnabled` | boolean | Нет | `true` | Тайбрейк при равном счёте |

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Воскресный падел",
    "date": "2026-05-05",
    "startTime": "10:00",
    "endTime": "12:00",
    "format": "AMERICANA",
    "pairingMode": "ROUND_ROBIN",
    "courtsCount": 2,
    "courtNames": ["Корт A", "Корт B"],
    "scoringMode": "POINTS",
    "pointsPerPlayerPerMatch": 6,
    "autoRounds": true
  }'
```

**Ответ (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Воскресный падел",
  "date": "2026-05-05",
  "startTime": "10:00",
  "endTime": "12:00",
  "format": "AMERICANA",
  "pairingMode": "ROUND_ROBIN",
  "status": "OPEN_FOR_REGISTRATION",
  "registeredCount": 0,
  "courtsCount": 2,
  "roundsPlanned": 6,
  "autoRounds": true,
  "scoringMode": "POINTS",
  "pointsPerPlayerPerMatch": 6,
  "setsPerMatch": 1,
  "gamesPerSet": 6,
  "tiebreakEnabled": true
}
```

**Коды ошибок:**
- `400` — Дата в прошлом / `courtsCount <= 0` / `title` пустое / `courtNames.size != courtsCount`
- `401` — Токен отсутствует или невалиден

### Игры на сегодня

**GET https://api.padix.club/api/events/today**

Получить список игр, запланированных на сегодня (по `LocalDate.now()`)

**Требует токен:** Да ✓

**Ответ (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Воскресный падел",
    "date": "2026-05-05",
    "startTime": "10:00",
    "endTime": "12:00",
    "format": "AMERICANA",
    "pairingMode": "ROUND_ROBIN",
    "status": "OPEN_FOR_REGISTRATION",
    "registeredCount": 6,
    "courtsCount": 2,
    "roundsPlanned": 6,
    "autoRounds": true,
    "scoringMode": "POINTS",
    "pointsPerPlayerPerMatch": 6,
    "setsPerMatch": 1,
    "gamesPerSet": 6,
    "tiebreakEnabled": true
  }
]
```

Поля те же, что в ответе на создание игры.

### Предстоящие игры

**GET https://api.padix.club/api/events/upcoming**

Получить предстоящие игры (по умолчанию от сегодня до +14 дней)

**Требует токен:** Да ✓

**Query параметры:**

| Параметр | Тип | Описание |
|---|---|---|
| `from` | string | Начало диапазона (YYYY-MM-DD), по умолчанию сегодня |
| `to` | string | Конец диапазона (YYYY-MM-DD), по умолчанию `from + 14 дней` |

**Пример:** 
```
GET https://api.padix.club/api/events/upcoming?from=2026-05-01&to=2026-05-15
```

**Ответ:** Массив объектов EventResponse (как в "Игры на сегодня")

### 📌 Возможные значения (Enum)

Перед описанием endpoints важно знать все возможные значения enum:

#### EventStatus — статус игры
| Значение | Описание |
|----------|---------|
| `DRAFT` | Черновик (не используется в API) |
| `OPEN_FOR_REGISTRATION` | Открыта регистрация — можно регистрироваться |
| `REGISTRATION_CLOSED` | Регистрация закрыта — ждёт старта |
| `IN_PROGRESS` | Идёт игра — можно вводить счёт |
| `FINISHED` | Завершена — рейтинг пересчитан |
| `CANCELLED` | Отменена |

#### EventFormat — формат игры
| Значение | Описание |
|----------|---------|
| `AMERICANA` | Американо (единственный формат на данный момент) |

#### PairingMode — режим расстановки
| Значение | Описание |
|----------|---------|
| `ROUND_ROBIN` | Все играют со всеми (карусель) |
| `BALANCED` | По рейтингу — пары формируются балансированно |

#### ScoringMode — система счёта
| Значение | Описание |
|----------|---------|
| `SETS` | По геймам/сетам (классика) |
| `POINTS` | По очкам (американо: 24 очка на матч) |

#### MatchStatus — статус матча
| Значение | Описание |
|----------|---------|
| `SCHEDULED` | Запланирован, ещё не сыгран |
| `FINISHED` | Завершён, счёт введён |

#### RegistrationStatus — статус регистрации
| Значение | Описание |
|----------|---------|
| `REGISTERED` | Зарегистрирован |
| `CANCELLED` | Отменена |

#### CancelRegistrationResponse.status — ответ отмены регистрации
| Значение | Описание |
|----------|---------|
| `CANCELLED` | Отменена сразу (есть время до игры или это организатор) |
| `REQUESTED` | Запрос на отмену создан, ждёт подтверждения организатора |

---

### 🟢 Детали игры

**GET https://api.padix.club/api/events/{eventId}**

Получить полную информацию об игре: раунды, матчи, счёт, зарегистрированных игроков

**Требует токен:** Нет (публичный, но токен нужен для корректного флага `isAuthor`)

**Path параметр:** `eventId` — UUID игры

**Пример запроса:**
```bash
curl -X GET https://api.padix.club/api/events/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <token>"
```

**Полный ответ (200 OK):**
```json
{
  "event": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Воскресный падел",
    "date": "2026-05-05",
    "startTime": "10:00",
    "endTime": "12:00",
    "format": "AMERICANA",
    "pairingMode": "ROUND_ROBIN",
    "status": "IN_PROGRESS",
    "registeredCount": 8,
    "courtsCount": 2,
    "roundsPlanned": 6,
    "autoRounds": true,
    "scoringMode": "POINTS",
    "pointsPerPlayerPerMatch": 6,
    "setsPerMatch": 1,
    "gamesPerSet": 6,
    "tiebreakEnabled": true
  },
  "rounds": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "roundNumber": 1,
      "matches": [
        {
          "id": "22222222-2222-2222-2222-222222222222",
          "courtNumber": 1,
          "courtName": "Корт A",
          "teamA": [
            {
              "id": "33333333-3333-3333-3333-333333333333",
              "name": "Алексей Иванов",
              "rating": 1850,
              "ntrp": "3.5",
              "gamesPlayed": 24,
              "calibrationEventsRemaining": 0,
              "publicId": "#123456789",
              "avatarUrl": "https://..."
            },
            {
              "id": "44444444-4444-4444-4444-444444444444",
              "name": "Иван Петров",
              "rating": 1750,
              "ntrp": "3.0",
              "gamesPlayed": 15,
              "calibrationEventsRemaining": 0,
              "publicId": "#987654321",
              "avatarUrl": null
            }
          ],
          "teamB": [
            {
              "id": "55555555-5555-5555-5555-555555555555",
              "name": "Сергей Смирнов",
              "rating": 1900,
              "ntrp": "3.5",
              "gamesPlayed": 30,
              "calibrationEventsRemaining": 0,
              "publicId": "#111222333",
              "avatarUrl": null
            },
            {
              "id": "66666666-6666-6666-6666-666666666666",
              "name": "Дмитрий Кузнецов",
              "rating": 1700,
              "ntrp": "3.0",
              "gamesPlayed": 12,
              "calibrationEventsRemaining": 3,
              "publicId": "#444555666",
              "avatarUrl": null
            }
          ],
          "status": "FINISHED",
          "score": {
            "mode": "POINTS",
            "points": {
              "teamAPoints": 16,
              "teamBPoints": 8
            },
            "sets": null
          }
        }
      ]
    }
  ],
  "registeredPlayers": [
    { "id": "...", "name": "...", "rating": 1850, ... }
  ],
  "pendingCancelRequests": [
    { "id": "...", "name": "Игрок запросил отмену", ... }
  ],
  "isAuthor": true,
  "authorName": "Алексей Иванов"
}
```

**Поля ответа:**

| Поле | Тип | Описание |
|------|-----|---------|
| `event` | object | Основная информация об игре (см. ниже) |
| `event.id` | UUID | UUID игры |
| `event.title` | string | Название игры |
| `event.date` | string (YYYY-MM-DD) | Дата игры |
| `event.startTime` | string (HH:mm) | Время начала |
| `event.endTime` | string (HH:mm) | Время окончания |
| `event.format` | enum | Формат: `AMERICANA` |
| `event.pairingMode` | enum | `ROUND_ROBIN` или `BALANCED` |
| `event.status` | enum | `DRAFT` / `OPEN_FOR_REGISTRATION` / `REGISTRATION_CLOSED` / `IN_PROGRESS` / `FINISHED` / `CANCELLED` |
| `event.registeredCount` | integer | Количество зарегистрированных игроков |
| `event.courtsCount` | integer | Количество кортов |
| `event.roundsPlanned` | integer | Запланировано раундов |
| `event.autoRounds` | boolean | Автоматическое создание раундов |
| `event.scoringMode` | enum | `SETS` или `POINTS` |
| `event.pointsPerPlayerPerMatch` | integer | Очков на игрока за матч (при `POINTS`). Сумма очков двух команд = `pointsPerPlayerPerMatch × 4` |
| `event.setsPerMatch` | integer | Сетов в матче (при `SETS`) |
| `event.gamesPerSet` | integer | Геймов в сете (при `SETS`) |
| `event.tiebreakEnabled` | boolean | Тайбрейк включён |
| `rounds` | array | Раунды игры (пусто пока игра не стартовала) |
| `rounds[].id` | UUID | UUID раунда |
| `rounds[].roundNumber` | integer | Номер раунда (с 1) |
| `rounds[].matches` | array | Матчи раунда |
| `rounds[].matches[].id` | UUID | UUID матча |
| `rounds[].matches[].courtNumber` | integer | Номер корта (с 1) |
| `rounds[].matches[].courtName` | string | Название корта (например "Корт A") |
| `rounds[].matches[].teamA` | array | 2 игрока команды A (объекты PlayerResponse) |
| `rounds[].matches[].teamB` | array | 2 игрока команды B (объекты PlayerResponse) |
| `rounds[].matches[].status` | enum | `SCHEDULED` или `FINISHED` |
| `rounds[].matches[].score` | object/null | Счёт матча или null если не введён |
| `rounds[].matches[].score.mode` | enum | `SETS` или `POINTS` |
| `rounds[].matches[].score.sets` | array/null | Счёт по сетам (при `SETS`) |
| `rounds[].matches[].score.sets[].teamAGames` | integer | Геймы команды A |
| `rounds[].matches[].score.sets[].teamBGames` | integer | Геймы команды B |
| `rounds[].matches[].score.points` | object/null | Счёт в очках (при `POINTS`) |
| `rounds[].matches[].score.points.teamAPoints` | integer | Очки команды A |
| `rounds[].matches[].score.points.teamBPoints` | integer | Очки команды B |
| `registeredPlayers` | array | Список зарегистрированных игроков (PlayerResponse) |
| `pendingCancelRequests` | array | Игроки, запросившие отмену (ждут подтверждения) |
| `isAuthor` | boolean | true — текущий пользователь является организатором |
| `authorName` | string | Имя организатора игры |

**Поля игрока (PlayerResponse):**

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID | Уникальный идентификатор игрока |
| `name` | string | Отображаемое имя |
| `rating` | integer | Рейтинг ELO |
| `ntrp` | string | Уровень: `1.0` / `1.5` / `2.0` / `2.5` / `3.0` / `3.5` / `4.0` / `4.5` / `5.0+` |
| `gamesPlayed` | integer | Всего сыграно матчей |
| `calibrationEventsRemaining` | integer/null | Осталось матчей до конца калибровки. `null` — данные недоступны, `0` — калибровка пройдена |
| `publicId` | string/null | Публичный ID для добавления в друзья (формат `#123456789`) |
| `avatarUrl` | string/null | URL аватара или null |

---

### 🟢 Зарегистрировать игрока на игру

**POST https://api.padix.club/api/events/{eventId}/register**

Регистрирует игрока на игру по его UUID. Игра должна быть в статусе `OPEN_FOR_REGISTRATION`.

**Требует токен:** Да ✓

**Path параметр:** `eventId` — UUID игры

**Параметры запроса (body):**

| Параметр | Тип | Обязателен | Описание |
|----------|-----|-----------|---------|
| `playerId` | UUID | Да | UUID игрока для регистрации (получить из `PlayerResponse.id`) |

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/events/550e8400-e29b-41d4-a716-446655440000/register \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "33333333-3333-3333-3333-333333333333"
  }'
```

**Ответ (200 OK):**
```json
{
  "id": "77777777-7777-7777-7777-777777777777",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "playerId": "33333333-3333-3333-3333-333333333333",
  "status": "REGISTERED",
  "cancelRequested": false,
  "cancelApproved": false,
  "cancelRequestedAt": null,
  "createdAt": "2026-05-01T10:00:00Z"
}
```

**Поля ответа:**

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID | UUID записи регистрации |
| `eventId` | UUID | UUID игры |
| `playerId` | UUID | UUID игрока |
| `status` | enum | `REGISTERED` или `CANCELLED` |
| `cancelRequested` | boolean | Запрошена отмена |
| `cancelApproved` | boolean | Отмена подтверждена |
| `cancelRequestedAt` | string/null | Время запроса отмены (ISO 8601) или null |
| `createdAt` | string | Время регистрации (ISO 8601) |

**Коды ошибок:**
- `404` — Event не найден или Player не найден
- `409` — Регистрация закрыта (статус игры уже не `OPEN_FOR_REGISTRATION`)

---

### 🟢 Закрыть регистрацию

**POST https://api.padix.club/api/events/{eventId}/close-registration**

Переводит игру из `OPEN_FOR_REGISTRATION` в `REGISTRATION_CLOSED`. Только организатор.

**Требует токен:** Да ✓ (только организатор)

**Path параметр:** `eventId` — UUID игры

**Body:** не требуется

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/events/550e8400-e29b-41d4-a716-446655440000/close-registration \
  -H "Authorization: Bearer <token>"
```

**Ответ (200 OK):** Пустое тело (`200 OK`, `Content-Length: 0`)

**Условия:**
- Должно быть зарегистрировано минимум `courtsCount × 4` игроков
- Игра должна быть в статусе `OPEN_FOR_REGISTRATION`

**Коды ошибок:**
- `403` — Только организатор может закрыть регистрацию
- `409` — Недостаточно игроков (например: "Нужно минимум 8 игроков, сейчас 6")

---

### 🟢 Отменить свою регистрацию

**POST https://api.padix.club/api/events/{eventId}/cancel**

Отменить свою регистрацию на игру. Если до игры более 24 часов или это организатор — отмена немедленная. Иначе создаётся запрос на подтверждение.

**Требует токен:** Да ✓

**Path параметр:** `eventId` — UUID игры

**Body:** не требуется

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/events/550e8400-e29b-41d4-a716-446655440000/cancel \
  -H "Authorization: Bearer <token>"
```

**Ответ (200 OK) — отмена прошла:**
```json
{
  "status": "CANCELLED",
  "message": "Cancelled"
}
```

**Ответ (200 OK) — требуется подтверждение организатора:**
```json
{
  "status": "REQUESTED",
  "message": "Cancellation requested from author"
}
```

**Поля ответа:**

| Поле | Тип | Описание |
|------|-----|---------|
| `status` | enum | `CANCELLED` (отменена) или `REQUESTED` (ждёт подтверждения) |
| `message` | string | Человекочитаемое сообщение |

**Логика:**
- Если до начала игры **более 24 часов** ИЛИ это **организатор** → `CANCELLED`
- Если до начала игры **менее 24 часов** → `REQUESTED` (ждёт подтверждения)

**Коды ошибок:**
- `404` — Event/User/Registration не найден
- `409` — Отмена недоступна (статус игры уже `IN_PROGRESS`, `FINISHED` или `CANCELLED`)

---

### 🟢 Удалить игрока из игры

**POST https://api.padix.club/api/events/{eventId}/remove/{playerId}**

Удалить игрока из игры. Только организатор. Нельзя если матчи уже сыграны.

**Требует токен:** Да ✓ (только организатор)

**Path параметры:**
- `eventId` — UUID игры
- `playerId` — UUID игрока для удаления

**Body:** не требуется

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/events/550e8400-e29b-41d4-a716-446655440000/remove/33333333-3333-3333-3333-333333333333 \
  -H "Authorization: Bearer <token>"
```

**Ответ (200 OK):** Пустое тело

**Условия:**
- Игра не должна быть в статусе `FINISHED` или `CANCELLED`
- Если игра в `IN_PROGRESS` — нельзя если есть введённый счёт или сыгранные матчи
- После удаления должно остаться минимум `courtsCount × 4` игроков (для игр в `IN_PROGRESS`)

**Коды ошибок:**
- `403` — Только организатор может удалять
- `404` — Регистрация не найдена
- `409` — Игра завершена / Введён счёт / Недостаточно игроков

---

### 🟢 Запустить игру

**POST https://api.padix.club/api/events/{eventId}/start**

Стартовать игру: создаёт раунды и расстановку матчей. Переводит игру из `REGISTRATION_CLOSED` в `IN_PROGRESS`. Только организатор.

**Требует токен:** Да ✓ (только организатор)

**Path параметр:** `eventId` — UUID игры

**Body:** не требуется

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/events/550e8400-e29b-41d4-a716-446655440000/start \
  -H "Authorization: Bearer <token>"
```

**Ответ (200 OK):** Пустое тело

**Условия:**
- Игра должна быть в статусе `REGISTRATION_CLOSED`
- Должно быть минимум `courtsCount × 4` зарегистрированных игроков

**Что происходит:**
1. Создаются раунды (`Round`) согласно `roundsPlanned` или автоматически
2. Создаются матчи (`Match`) с расстановкой команд по `pairingMode`
3. Статус игры меняется на `IN_PROGRESS`

**Коды ошибок:**
- `403` — Только организатор может запустить игру
- `409` — Игра не в статусе `REGISTRATION_CLOSED` или недостаточно игроков

---

### 🟢 Записать счёт матча

**POST https://api.padix.club/api/events/matches/{matchId}/score**

Записать итоговый счёт матча. Доступно только пока игра в статусе `IN_PROGRESS`. Только организатор.

**Требует токен:** Да ✓ (только организатор)

**Path параметр:** `matchId` — UUID матча

**Параметры запроса (body):**

⚠️ **Важно:** Заполни **только одно** поле — `sets` или `points` — в зависимости от `scoringMode` игры.

| Параметр | Тип | Описание |
|----------|-----|---------|
| `sets` | array/null | Счёт по сетам (если `scoringMode=SETS`) |
| `points` | object/null | Счёт в очках (если `scoringMode=POINTS`) |

**Структура `sets[]`:**

| Поле | Тип | Описание |
|------|-----|---------|
| `teamAGames` | integer | Геймы команды A (>= 0) |
| `teamBGames` | integer | Геймы команды B (>= 0) |

**Структура `points`:**

| Поле | Тип | Описание |
|------|-----|---------|
| `teamAPoints` | integer | Очки команды A (>= 0) |
| `teamBPoints` | integer | Очки команды B (>= 0) |

**Пример для SETS (играли 3 сета):**
```bash
curl -X POST https://api.padix.club/api/events/matches/22222222-2222-2222-2222-222222222222/score \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sets": [
      { "teamAGames": 6, "teamBGames": 4 },
      { "teamAGames": 4, "teamBGames": 6 },
      { "teamAGames": 7, "teamBGames": 5 }
    ]
  }'
```

**Пример для POINTS (24 очка на матч при `pointsPerPlayerPerMatch=6`):**
```bash
curl -X POST https://api.padix.club/api/events/matches/22222222-2222-2222-2222-222222222222/score \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "points": {
      "teamAPoints": 16,
      "teamBPoints": 8
    }
  }'
```

**Ответ (200 OK):** Пустое тело

**Условия валидации:**

Для `POINTS`:
- Сумма `teamAPoints + teamBPoints` должна быть равна `pointsPerPlayerPerMatch × 4` (по умолчанию 24)
- Очки не могут быть отрицательными

Для `SETS`:
- Количество сетов не должно превышать `setsPerMatch` игры
- Геймы не могут быть отрицательными
- Поле `sets` обязательно

**Что происходит:**
1. Сохраняется счёт в `match_set_scores`
2. Удаляется черновой счёт (если был)
3. Статус матча меняется на `FINISHED`

**Коды ошибок:**
- `400` — Неверная сумма очков / нет sets для SETS / отрицательные значения
- `403` — Только организатор может вводить счёт
- `404` — Матч не найден
- `409` — Игра не в статусе `IN_PROGRESS`

---

### 🟢 Завершить игру

**POST https://api.padix.club/api/events/{eventId}/finish**

Завершить игру. Переводит из `IN_PROGRESS` в `FINISHED`, пересчитывает рейтинги ELO всех игроков. Только организатор. Если не все матчи завершены — автоматически вызывается `force-finish`.

**Требует токен:** Да ✓ (только организатор)

**Path параметр:** `eventId` — UUID игры

**Body:** не требуется

**Пример запроса:**
```bash
curl -X POST https://api.padix.club/api/events/550e8400-e29b-41d4-a716-446655440000/finish \
  -H "Authorization: Bearer <token>"
```

**Ответ (200 OK):** Пустое тело

**Условия:**
- Игра должна быть в статусе `IN_PROGRESS`

**Что происходит:**
1. Черновые счета (draft scores) превращаются в финальные счета
2. Для каждого завершённого матча пересчитывается рейтинг ELO всех 4 игроков
3. Создаются записи в `RatingChange` (можно посмотреть в истории рейтинга)
4. Создаются уведомления `UserRatingNotification` для каждого игрока (можно показать pop-up)
5. Калибровка (`calibrationMatchesRemaining`) уменьшается на 1 для всех участников
6. Статус игры меняется на `FINISHED`

**Коды ошибок:**
- `403` — Только организатор может завершить игру
- `409` — Игра не в статусе `IN_PROGRESS`

---

## Социальные функции

### Друзья

#### Отправить заявку в друзья

**POST /api/friends/request**

**Требует токен:** Да

```json
{
  "publicId": "#123456789"
}
```

#### Принять заявку в друзья

**POST /api/friends/accept**

**Требует токен:** Да

```json
{
  "publicId": "#123456789"
}
```

#### Отклонить заявку в друзья

**POST /api/friends/decline**

**Требует токен:** Да

#### Список друзей

**GET /api/friends**

Получить список друзей и заявок

**Требует токен:** Да

**Ответ:**
```json
{
  "friends": [
    { "id": "...", "name": "John", ... },
    ...
  ],
  "incoming": [
    { "id": "...", "name": "Jane", "publicId": "#123" },
    ...
  ],
  "outgoing": [
    { "id": "...", "name": "Bob", "publicId": "#456" },
    ...
  ]
}
```

### Приглашения на игры

#### Пригласить друга на игру

**POST /api/events/{eventId}/invite**

**Требует токен:** Да

```json
{
  "publicId": "#123456789"
}
```

#### Получить входящие приглашения

**GET /api/invites**

Получить все входящие приглашения на игры

**Требует токен:** Да

**Ответ:**
```json
[
  {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Воскресный падел",
    "date": "2026-05-01",
    "startTime": "10:00",
    "invitedBy": "John Doe"
  },
  ...
]
```

#### Принять приглашение

**POST /api/events/{eventId}/invites/accept**

**Требует токен:** Да

#### Отклонить приглашение

**POST /api/events/{eventId}/invites/decline**

**Требует токен:** Да

#### Статус приглашений для конкретной игры

**GET /api/events/{eventId}/invites**

Получить статус приглашений, отправленных текущим пользователем

**Требует токен:** Да

---

## Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | Неверные параметры запроса |
| 401 | Не авторизован (токен отсутствует или невалиден) |
| 403 | Доступ запрещен (недостаточно прав) |
| 404 | Ресурс не найден |
| 409 | Конфликт (например, попытка зарегистрироваться дважды) |
| 500 | Ошибка сервера |

**Формат ошибки:**
```json
{
  "timestamp": "2026-05-01T10:00:00Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Описание ошибки"
}
```

---

## Практические советы для Android разработчиков

### Сохранение токена

- Сохраняйте JWT токен в `EncryptedSharedPreferences` (используйте Security library)
- Токен живет **30 дней** — обычно не требуется повторный вход
- Перед использованием проверяйте, не истёк ли токен
- При ошибке `401 Unauthorized` токен истёк — предложите пользователю заново войти
- Удаляйте токен при выходе из аккаунта (кнопка "Выход")

**Как проверить, истёк ли токен (Kotlin):**
```kotlin
fun isTokenExpired(token: String): Boolean {
    try {
        val parts = token.split(".")
        if (parts.size != 3) return true
        
        val payload = String(Base64.getDecoder().decode(parts[1]))
        val json = JSONObject(payload)
        val exp = json.getLong("exp") * 1000 // в миллисекунды
        
        return System.currentTimeMillis() > exp
    } catch (e: Exception) {
        return true
    }
}

// Использование:
if (isTokenExpired(savedToken)) {
    // Токен истёк - нужно заново войти
    startLoginActivity()
}
```

### HTTP клиент

- Используйте **Retrofit** или **OkHttp** для HTTP запросов
- Установите timeout в 30 секунд для сетевых запросов
- Используйте data classes (Kotlin) или POJO для десериализации JSON (например, с помощью Gson или Moshi)
- Добавьте Interceptor для автоматического добавления токена в каждый запрос

**Пример Interceptor на Kotlin:**
```kotlin
class AuthInterceptor(private val tokenProvider: TokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val token = tokenProvider.getToken()
        
        return if (token != null) {
            val newRequest = originalRequest.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
            chain.proceed(newRequest)
        } else {
            chain.proceed(originalRequest)
        }
    }
}
```

### Обработка ошибок

- Всегда проверяйте статус код ответа
- Показывайте пользователю понятные сообщения об ошибках (не технические детали)
- Реализуйте retry механизм для временных ошибок сети (например, использование Okhttp Interceptor)
- Логируйте ошибки для отладки, но не показывайте логи пользователю

### Кэширование

- Кэшируйте список игроков в памяти (обновляйте каждые 5 минут)
- Используйте **Room** (локальная БД) для хранения истории игр
- Реализуйте синхронизацию при наличии интернета (например, при запуске приложения)
- Кэшируйте профиль пользователя и обновляйте его при входе

### Тестирование

- Протестируйте все основные user flows (вход, создание игры, регистрация на игру, и т.д.)
- Проверьте поведение приложения при потере интернета
- Используйте **MockWebServer** для юнит тестов API интеграции
- Проверьте обработку различных HTTP кодов (400, 401, 404, 500)

### Рекомендуемые библиотеки

**Android:**
- `com.squareup.retrofit2:retrofit` - HTTP клиент
- `com.squareup.retrofit2:converter-gson` - JSON сериализация
- `androidx.security:security-crypto` - Безопасное хранилище
- `androidx.room:room-runtime` - Локальная БД
- `org.junit.jupiter:junit-jupiter` - Юнит тесты
- `com.squareup.okhttp3:mockwebserver` - Mock сервер для тестов

---

**Документация разработана для версии 1.0 API.**

**Дата:** май 2026 г.
