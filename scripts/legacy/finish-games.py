#!/usr/bin/env python3
"""
Завершает 5 созданных игр с результатами матчей
"""
import requests
import json
from datetime import datetime

API_BASE = "http://localhost:8080"

# Получим список событий
print("📅 Получаю список игр...")
events_resp = requests.get(f"{API_BASE}/api/events/upcoming/{datetime.now().date()}/{datetime.now().date()}")
events = events_resp.json() if events_resp.status_code == 200 else []

if not events:
    print("❌ Игры не найдены")
    exit(1)

print(f"✅ Найдено {len(events)} игр\n")

# Получим список игроков
print("👥 Получаю список игроков...")
players_resp = requests.get(f"{API_BASE}/api/players/rating")
players = players_resp.json() if players_resp.status_code == 200 else []
player_ids = [p.get("id") for p in players[:10]]
print(f"✅ Загружено {len(player_ids)} игроков\n")

# Для каждой игры
for i, event in enumerate(events[:5], 1):
    event_id = event.get("id")
    print(f"🎾 Игра {i}: {event.get('title')}")

    # Регистрируем игроков
    num_players = 4 + i
    for player_id in player_ids[:num_players]:
        requests.post(
            f"{API_BASE}/api/events/{event_id}/register",
            json={"playerId": player_id}
        )
    print(f"  ✅ Зарегистрировано {num_players} игроков")

    # Начинаем игру
    start_resp = requests.post(f"{API_BASE}/api/events/{event_id}/start")
    if start_resp.status_code not in [200, 204]:
        print(f"  ⚠️  Не удалось начать игру: {start_resp.text}")
    else:
        print("  ✅ Игра начата")

    # Получим детали события с матчами
    event_details = requests.get(f"{API_BASE}/api/events/{event_id}").json()
    rounds = event_details.get("rounds", [])

    # Добавим результаты для каждого матча
    match_count = 0
    for round_data in rounds:
        matches = round_data.get("matches", [])
        for match in matches:
            match_id = match.get("id")
            if not match_id:
                continue

            # Случайный результат 21-15 для teamA
            score_data = {
                "points": {
                    "teamAPoints": 21 + (match_count % 3),
                    "teamBPoints": 15 + (match_count % 2)
                }
            }

            score_resp = requests.post(
                f"{API_BASE}/api/events/matches/{match_id}/score",
                json=score_data
            )
            if score_resp.status_code in [200, 204]:
                match_count += 1

    print(f"  ✅ Добавлены результаты {match_count} матчей")

    # Завершаем игру
    finish_resp = requests.post(f"{API_BASE}/api/events/{event_id}/finish")
    if finish_resp.status_code not in [200, 204]:
        print(f"  ⚠️  Не удалось завершить: {finish_resp.text}")
    else:
        print("  ✅ Игра завершена\n")

print("✨ Все игры завершены!")
