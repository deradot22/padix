# 🐳 Docker Guide - Правила Работы с БД

## ⚠️ КРИТИЧЕСКОЕ ПРАВИЛО

**НИКОГДА не используй:**
```bash
docker-compose down -v  # ❌ УДАЛЯЕТ ВСЕ ДАННЫЕ!
```

**Используй вместо этого:**
```bash
docker-compose down     # ✅ Останавливает контейнеры, СОХРАНЯЕТ базу
```

---

## 📋 Правильные Команды

### Запустить все контейнеры:
```bash
docker-compose up -d
```

### Остановить контейнеры (БД СОХРАНИТСЯ):
```bash
docker-compose down
```

### Пересобрать и запустить:
```bash
docker-compose up -d --build
```

### Посмотреть статус:
```bash
docker ps
```

### Удалить все (если ДЕЙСТВИТЕЛЬНО нужно):
```bash
docker-compose down -v  # ТОЛЬКО если уверен!
```

---

## 🔧 Как Работает База Данных

**Файл:** `compose.yml` (строки 10-11, 40)

```yaml
volumes:
  pgdata: {}                    # Named volume для БД

services:
  db:
    volumes:
      - pgdata:/var/lib/postgresql/data  # Данные хранятся в pgdata
```

**Что это значит:**
- ✅ `pgdata` - это **named volume**, который сохраняет данные
- ✅ Когда контейнер `postgres:16` стопится/перезагружается - данные остаются
- ❌ Только `docker-compose down -v` удалит этот volume

---

## 🎯 Основной Workflow

```bash
# 1. Первый раз - запустить с нуля
docker-compose up -d

# 2. Работать с приложением
# ... создавать события, игроков, матчи ...

# 3. Остановить (но НЕ удалить данные!)
docker-compose down

# 4. Позже - снова запустить (данные вернутся!)
docker-compose up -d
```

---

## 💾 Проверка Volumes

```bash
# Посмотреть все volumes
docker volume ls

# Посмотреть информацию о pgdata
docker volume inspect padix_pgdata

# Посмотреть размер БД
docker exec padix-db-1 du -sh /var/lib/postgresql/data
```

---

## 🚨 Если Случайно Удалил Данные

```bash
# Посмотреть список volumes
docker volume ls

# Если padix_pgdata удален - пересоздать (с чистой БД)
docker-compose up -d --build

# Все данные будут потеряны, придется создавать заново
```

---

## 📌 Памятка

| Команда | Эффект |
|---------|--------|
| `docker-compose up -d` | Запустить контейнеры |
| `docker-compose down` | Остановить (БД в сохранности) ✅ |
| `docker-compose down -v` | Остановить + удалить ВСЮ БД ❌ |
| `docker-compose ps` | Статус контейнеров |
| `docker-compose logs` | Логи |
| `docker volume ls` | Список volumes |

---

**Главное:** Используй `docker-compose down` БЕЗ флага `-v`! 
