import { useMemo, useState } from "react";
import { ApiError, auth, events } from "../api";
import { store, TestUser, useStore } from "../store";
import { Log, LogEntry } from "../components/Log";

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function GamesPage() {
  const users = useStore((s) => s.users);
  const [organizerId, setOrganizerId] = useState<string>("");
  const [title, setTitle] = useState("Тестовая игра");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [courtsCount, setCourtsCount] = useState(2);
  const [pairingMode, setPairingMode] = useState<"ROUND_ROBIN" | "BALANCED">("ROUND_ROBIN");
  const [scoringMode, setScoringMode] = useState<"POINTS" | "SETS">("POINTS");
  const [pointsPerPlayerPerMatch, setPoints] = useState(6);
  const [registerAll, setRegisterAll] = useState(true);
  const [registerCount, setRegisterCount] = useState(8);
  const [includeOrganizer, setIncludeOrganizer] = useState(true);
  const [running, setRunning] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const organizer = useMemo(() => users.find((u) => u.id === organizerId), [users, organizerId]);
  const capacity = courtsCount * 4;

  function log(level: LogEntry["level"], text: string) {
    setEntries((prev) => [...prev, { level, text, ts: Date.now() }]);
  }

  function toggleSelected(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function playersToRegister(): TestUser[] {
    const list: TestUser[] = [];
    if (includeOrganizer && organizer) list.push(organizer);
    if (registerAll) {
      for (const u of users) {
        if (u.id === organizerId) continue;
        if (list.length >= capacity || list.length - (includeOrganizer ? 1 : 0) >= registerCount) break;
        list.push(u);
      }
    } else {
      for (const u of users) {
        if (u.id === organizerId) continue;
        if (!selectedIds.has(u.id)) continue;
        if (list.length >= capacity) break;
        list.push(u);
      }
    }
    return list;
  }

  async function createGame() {
    if (!organizer) {
      log("err", "Выбери организатора");
      return;
    }
    setRunning(true);
    try {
      log("info", `Создаю игру «${title}» от ${organizer.email}…`);
      const event = await events.create(organizer.token, {
        title,
        date,
        startTime,
        endTime,
        format: "AMERICANA",
        pairingMode,
        courtsCount,
        autoRounds: true,
        scoringMode,
        pointsPerPlayerPerMatch,
      });
      log("ok", `✓ Создана: ${event.id} (вместимость ${capacity})`);

      const targets = playersToRegister();
      log("info", `Регистрирую ${targets.length} игроков…`);
      for (const p of targets) {
        const ok = await registerWithResync(event.id, organizer.token, p, log);
        if (!ok) continue;
      }
      log("ok", `Готово. Игра: http://localhost:8083/games (id=${event.id})`);
    } catch (e) {
      log("err", `Ошибка создания: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function syncAll() {
    log("info", `Синхронизирую ${users.length} юзеров с БД…`);
    let synced = 0;
    let removed = 0;
    for (const u of users) {
      try {
        const { token } = await auth.login({ email: u.email, password: u.password });
        const me = await auth.me(token);
        if (me.playerId !== u.playerId) {
          log("warn", `   ⟳ ${u.email}: playerId ${u.playerId.slice(0, 8)}… → ${me.playerId.slice(0, 8)}…`);
        }
        store.removeUser(u.id);
        store.addUser({ ...u, token, playerId: me.playerId, surveyCompleted: me.surveyCompleted });
        synced++;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          log("err", `   × ${u.email}: нет в БД, удаляю из локального списка`);
          store.removeUser(u.id);
          removed++;
        } else {
          log("err", `   × ${u.email}: ${(e as Error).message}`);
        }
      }
    }
    log("ok", `Готово. Синхронизировано: ${synced}, удалено: ${removed}`);
  }

  async function loadToday() {
    if (!organizer) {
      log("err", "Выбери пользователя для запроса /events/today");
      return;
    }
    try {
      const today = await events.today(organizer.token);
      log("info", `Сегодня игр: ${today.length}`);
      for (const e of today) {
        log(
          "info",
          `   · ${e.title} — ${e.startTime}-${e.endTime} · ${e.status} · ${e.registeredCount} игроков`,
        );
      }
    } catch (e) {
      log("err", (e as Error).message);
    }
  }

  if (users.length === 0) {
    return (
      <div className="card">
        <h2>Нет пользователей</h2>
        <p className="muted">
          Сначала создай пользователей на вкладке «Пользователи» — они нужны как организатор и
          участники.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>Создать игру</h2>

        <div className="row">
          <div className="field">
            <label>Организатор</label>
            <select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)}>
              <option value="">— выбери —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Название</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Начало</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label>Конец</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Кортов</label>
            <input
              type="number"
              min={1}
              max={8}
              value={courtsCount}
              onChange={(e) => setCourtsCount(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="field">
            <label>Расстановка</label>
            <select value={pairingMode} onChange={(e) => setPairingMode(e.target.value as "ROUND_ROBIN" | "BALANCED")}>
              <option value="ROUND_ROBIN">ROUND_ROBIN</option>
              <option value="BALANCED">BALANCED</option>
            </select>
          </div>
          <div className="field">
            <label>Система счёта</label>
            <select value={scoringMode} onChange={(e) => setScoringMode(e.target.value as "POINTS" | "SETS")}>
              <option value="POINTS">POINTS (американка)</option>
              <option value="SETS">SETS</option>
            </select>
          </div>
          {scoringMode === "POINTS" && (
            <div className="field">
              <label>Очков на игрока</label>
              <input
                type="number"
                min={1}
                value={pointsPerPlayerPerMatch}
                onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
          <div className="field" style={{ alignSelf: "center" }}>
            <span className="muted small">Вместимость: {capacity} игроков</span>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Кого регистрировать?</h3>
          <div className="row" style={{ marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={includeOrganizer}
                onChange={(e) => setIncludeOrganizer(e.target.checked)}
              />
              Организатор тоже играет
            </label>
          </div>
          <div className="row">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                checked={registerAll}
                onChange={() => setRegisterAll(true)}
              />
              Первых N (помимо организатора)
            </label>
            {registerAll && (
              <div className="field">
                <label>N</label>
                <input
                  type="number"
                  min={0}
                  max={capacity}
                  value={registerCount}
                  onChange={(e) =>
                    setRegisterCount(Math.max(0, Math.min(capacity, Number(e.target.value) || 0)))
                  }
                />
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                checked={!registerAll}
                onChange={() => setRegisterAll(false)}
              />
              Вручную ({selectedIds.size} выбрано)
            </label>
          </div>

          {!registerAll && (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Email</th>
                  <th>Имя</th>
                  <th>playerId</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isOrganizer = u.id === organizerId;
                  return (
                    <tr key={u.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isOrganizer ? includeOrganizer : selectedIds.has(u.id)}
                          disabled={isOrganizer}
                          onChange={() => toggleSelected(u.id)}
                        />
                      </td>
                      <td className="mono small">
                        {u.email} {isOrganizer && <span className="badge active">организатор</span>}
                      </td>
                      <td>{u.name}</td>
                      <td className="mono small">{u.playerId.slice(0, 8)}…</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button onClick={createGame} disabled={running || !organizer}>
            {running ? "Создаю…" : "Создать игру и зарегистрировать"}
          </button>
          <button className="secondary" onClick={loadToday} disabled={!organizer}>
            Что сегодня? (GET /events/today)
          </button>
          <button className="secondary" onClick={syncAll} disabled={running}>
            ⟳ Синхронизировать всех с БД
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <Log entries={entries} />
        </div>
      </div>
    </div>
  );
}

/**
 * Регистрирует игрока на событие. Если бекенд отдал 404 «Player not found»,
 * пробует перелогинить юзера (получить актуальный playerId из БД) и повторить.
 *
 * Решает проблему: БД пересоздавалась → playerId в localStorage устарел.
 */
async function registerWithResync(
  eventId: string,
  organizerToken: string,
  player: TestUser,
  log: (level: "ok" | "err" | "warn" | "info", text: string) => void,
): Promise<boolean> {
  try {
    await events.registerPlayer(organizerToken, eventId, player.playerId);
    log("ok", `   ✓ ${player.name} (${player.email})`);
    return true;
  } catch (e) {
    const isMissing = e instanceof ApiError && e.status === 404;
    if (!isMissing) {
      log("err", `   × ${player.name}: ${(e as Error).message}`);
      return false;
    }

    // 404 → пробуем перелогинить и взять свежий playerId
    log("warn", `   ⟳ ${player.name}: устарел playerId, перелогиниваю…`);
    try {
      const { token } = await auth.login({ email: player.email, password: player.password });
      const me = await auth.me(token);
      store.removeUser(player.id);
      store.addUser({ ...player, token, playerId: me.playerId, surveyCompleted: me.surveyCompleted });
      await events.registerPlayer(organizerToken, eventId, me.playerId);
      log("ok", `   ✓ ${player.name} (после resync)`);
      return true;
    } catch (e2) {
      log("err", `   × ${player.name}: ${(e2 as Error).message}`);
      return false;
    }
  }
}
