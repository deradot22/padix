## Локальный запуск

Ниже два способа: через Podman (как сейчас у тебя) и напрямую через Gradle/Vite.

### Вариант 1: Podman (рекомендуется, как в текущем проекте)

1) БД (один раз):

```
podman network create padix-net || true
podman rm -f padix-db || true
podman run -d --name padix-db --restart unless-stopped \
  --network padix-net \
  -e POSTGRES_DB=padix \
  -e POSTGRES_USER=padix \
  -e POSTGRES_PASSWORD=padix \
  -p 5432:5432 \
  docker.io/library/postgres:16
```

2) Backend:

```
podman build -t padix-api:latest .
podman rm -f padix-api || true
podman run -d --name padix-api --restart unless-stopped \
  --network padix-net \
  -p 8080:8080 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://padix-db:5432/padelgo \
  -e SPRING_DATASOURCE_USERNAME=padelgo \
  -e SPRING_DATASOURCE_PASSWORD=padelgo \
  padix-api:latest
```

3) Frontend (Vite dev + HMR):

```
podman rm -f padix-web || true
podman run -d --name padix-web --restart unless-stopped \
  -p 8081:5173 \
  -v "/Users/ruazrh/IdeaProjects/padix/web:/app" \
  -w /app \
  -e VITE_API_BASE_URL=http://localhost:8080 \
  -e CHOKIDAR_USEPOLLING=1 \
  -e CHOKIDAR_INTERVAL=500 \
  docker.io/library/node:20-alpine sh -c "npm install && npm run dev -- --host 0.0.0.0 --port 5173"
```

Открывай:
- Frontend: http://localhost:8081
- Backend: http://localhost:8080

Полезно:
```
podman logs -f padix-api
podman logs -f padix-web
```

---

### Вариант 2: Без контейнеров (Gradle + Vite)

Backend:
```
./gradlew bootRun
```
Переменные окружения (если нет .env):
```
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/padelgo
SPRING_DATASOURCE_USERNAME=padelgo
SPRING_DATASOURCE_PASSWORD=padelgo
```

Frontend:
```
cd web
npm install
VITE_API_BASE_URL=http://localhost:8080 npm run dev
```

Открывай:
- Frontend: http://localhost:5173
- Backend: http://localhost:8080

