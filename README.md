## PadelGo backend (MVP)

Бэкенд для падельного приложения:
- Главная: игры на сегодня
- Рейтинг участников
- Регистрация на игру, расписание/распределение по кортам, ввод счёта
- Пересчёт рейтинга после завершения игр

### Стек
- Kotlin + Spring Boot
- Spring Web, Validation
- Spring Data JPA
- Flyway migrations
- H2 (in-memory для разработки)
- OpenAPI/Swagger UI

### Запуск
Требования: JDK 21.

```bash
gradle bootRun
```

Swagger UI: `http://localhost:8080/swagger-ui.html`

### Фронтенд (сайт)
Фронт лежит в папке `web/` и использует API бэкенда.

```bash
cd web
npm i
npm run dev
```

### Фронтенд в Podman (Nginx + proxy /api -> backend)
Запуск (предполагается, что `padelgo-api` уже запущен в сети `padelgo-net`):

```bash
podman rm -f padelgo-web 2>/dev/null || true
podman build -t padelgo-web ./web
podman run -d --name padelgo-web --network padelgo-net -p 8081:80 localhost/padelgo-web:latest
```

Сайт: `http://localhost:8081` (API проксируется на бэк по `/api`).

### Запуск в Podman (PostgreSQL + API)
Требования: `podman` и (опционально) `podman-compose`.

Вариант A (compose):

```bash
podman-compose -f compose.yml up --build
```

Вариант B (ручной запуск):

```bash
podman run -d --name padelgo-db \
  -e POSTGRES_DB=padelgo -e POSTGRES_USER=padelgo -e POSTGRES_PASSWORD=padelgo \
  -p 5432:5432 docker.io/library/postgres:16

podman build -t padelgo-api .
podman run --rm --name padelgo-api \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.containers.internal:5432/padelgo \
  -e SPRING_DATASOURCE_USERNAME=padelgo \
  -e SPRING_DATASOURCE_PASSWORD=padelgo \
  -p 8080:8080 padelgo-api
```

### Базовые сущности
- `Player`: участник и его рейтинг
- `Event`: игровая сессия (например “Американка”)
- `Registration`: запись участника на сессию
- `Round`, `Match`: раунды и матчи по кортам
- `MatchSetScore`: счёт по сетам (или, в режиме POINTS, один "сет" как контейнер очков)
- `RatingChange`: история изменения рейтинга

### Американка "24 очка" (6 подач на игрока)
Выбираешь режим подсчёта `POINTS` и число подач на игрока `pointsPerPlayerPerMatch=6`.
Тогда на матч должно приходиться ровно \(6 * 4 = 24\) очка (сумма очков двух команд).

Изменить количество подач можно до старта (пока `status=OPEN_FOR_REGISTRATION`):

```bash
curl -X PATCH localhost:8080/api/events/<eventId> \
  -H 'Content-Type: application/json' \
  -d '{"pointsPerPlayerPerMatch":5}'
```


