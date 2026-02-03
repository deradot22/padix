import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PairingMode } from "../../lib/api";

function todayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function CreateEventPage(props: { me: any; meLoaded?: boolean }) {
  const nav = useNavigate();
  const [title, setTitle] = useState("Американка");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [pairingMode, setPairingMode] = useState<PairingMode>("ROUND_ROBIN");
  const [courts, setCourts] = useState(2);
  const [autoRounds, setAutoRounds] = useState(true);
  const [rounds, setRounds] = useState(6);
  const [pointsPerPlayer, setPointsPerPlayer] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const startDt = new Date(`${date}T${startTime}`);
      const endDt = new Date(`${date}T${endTime}`);
      if (Number.isNaN(startDt.getTime()) || startDt.getTime() < Date.now()) {
        throw new Error("Дата и время должны быть в будущем");
      }
      if (Number.isNaN(endDt.getTime()) || endDt.getTime() <= startDt.getTime()) {
        throw new Error("Время окончания должно быть позже начала");
      }
      await api.createEvent({
        title,
        date,
        startTime,
        endTime,
        format: "AMERICANA",
        pairingMode,
        courtsCount: courts,
        autoRounds,
        roundsPlanned: autoRounds ? undefined : rounds,
        scoringMode: "POINTS",
        pointsPerPlayerPerMatch: pointsPerPlayer,
      });
      nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="section-title">Создать игру</div>
      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={onSubmit}>
          <label className="label">Название</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div style={{ height: 10 }} />
          <label className="label">Дата</label>
          <input
            className="input"
            type="date"
            min={todayIso()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div style={{ height: 10 }} />
          <label className="label">Время (с — по)</label>
          <div className="row time-row">
            <div className="time-group">
              <select
                className="input time-hour"
                value={startTime.split(":")[0] ?? "00"}
                onChange={(e) => setStartTime(`${e.target.value}:${startTime.split(":")[1] ?? "00"}`)}
              >
                {Array.from({ length: 24 }).map((_, i) => {
                  const hour = `${i}`.padStart(2, "0");
                  return (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  );
                })}
              </select>
              <select
                className="input time-minute"
                value={startTime.split(":")[1] ?? "00"}
                onChange={(e) => setStartTime(`${startTime.split(":")[0] ?? "00"}:${e.target.value}`)}
              >
                <option value="00">00</option>
                <option value="30">30</option>
              </select>
            </div>
            <span className="muted">—</span>
            <div className="time-group">
              <select
                className="input time-hour"
                value={endTime.split(":")[0] ?? "00"}
                onChange={(e) => setEndTime(`${e.target.value}:${endTime.split(":")[1] ?? "00"}`)}
              >
                {Array.from({ length: 24 }).map((_, i) => {
                  const hour = `${i}`.padStart(2, "0");
                  return (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  );
                })}
              </select>
              <select
                className="input time-minute"
                value={endTime.split(":")[1] ?? "00"}
                onChange={(e) => setEndTime(`${endTime.split(":")[0] ?? "00"}:${e.target.value}`)}
              >
                <option value="00">00</option>
                <option value="30">30</option>
              </select>
            </div>
          </div>

          <div style={{ height: 10 }} />
          <label className="label">Количество кортов</label>
          <input
            className="input"
            type="number"
            min={1}
            value={courts}
            onChange={(e) => setCourts(Number(e.target.value))}
          />
          <div className="muted" style={{ marginTop: 6 }}>
            Для старта игры нужно минимум {courts * 4} игроков.
          </div>

          <div style={{ height: 10 }} />
          <label className="label">Режим американки</label>
          <div className={`switcher ${pairingMode === "ROUND_ROBIN" ? "is-left" : "is-right"}`}>
            <button
              type="button"
              className={`switcher-option ${pairingMode === "ROUND_ROBIN" ? "is-active" : ""}`}
              onClick={() => setPairingMode("ROUND_ROBIN")}
            >
              Каждый с каждым
            </button>
            <button
              type="button"
              className={`switcher-option ${pairingMode === "BALANCED" ? "is-active" : ""}`}
              onClick={() => setPairingMode("BALANCED")}
            >
              Равный бой
            </button>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            «Равный бой» сам подбирает пары с близким средним рейтингом и не ставит сильных против слабых.
          </div>

          <div style={{ height: 10 }} />
          <label className="label">Раунды (подачи/ротации)</label>
          <div className={`switcher ${autoRounds ? "is-left" : "is-right"}`}>
            <button
              type="button"
              className={`switcher-option ${autoRounds ? "is-active" : ""}`}
              onClick={() => setAutoRounds(true)}
            >
              Авто по уровню игроков
            </button>
            <button
              type="button"
              className={`switcher-option ${!autoRounds ? "is-active" : ""}`}
              onClick={() => setAutoRounds(false)}
            >
              Вручную
            </button>
          </div>
          {!autoRounds ? (
            <div style={{ marginTop: 10 }}>
              <input
                className="input"
                type="number"
                min={1}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
              />
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>
              Количество раундов будет рассчитано автоматически при старте игры.
            </div>
          )}

          <div style={{ height: 10 }} />
          <label className="label">Подач на игрока (POINTS)</label>
          <input
            className="input"
            type="number"
            min={1}
            value={pointsPerPlayer}
            onChange={(e) => setPointsPerPlayer(Number(e.target.value))}
          />

          <div className="row stack" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={loading}>
              {loading ? "Создаём…" : "Создать"}
            </button>
          </div>

          {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
        </form>
      </div>
    </>
  );
}

