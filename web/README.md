## padix Web

Фронтенд (React + Vite) для работы с API бэкенда.

### Запуск
Требования: Node.js 20+.

```bash
cd web
npm i
npm run dev
```

По умолчанию фронт ходит в `http://localhost:8080`.
Можно поменять через переменную окружения:

```bash
VITE_API_BASE_URL=http://localhost:8080 npm run dev
```

### Cloudflare Pages
Рекомендуемые настройки:

- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables:
  - `VITE_API_BASE_URL` = `https://<твой-api-домен>`

