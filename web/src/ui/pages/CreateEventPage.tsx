import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PairingMode } from "../../lib/api";

function todayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function CreateEventPage(props: { me: any }) {
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
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, nav]);

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
          <div className="row">
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <span className="muted">—</span>
            <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
          <div className="row">
            <button
              type="button"
              className={pairingMode === "ROUND_ROBIN" ? "btn primary" : "btn"}
              onClick={() => setPairingMode("ROUND_ROBIN")}
            >
              Каждый с каждым
            </button>
            <button
              type="button"
              className={pairingMode === "BALANCED" ? "btn primary" : "btn"}
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
          <div className="row">
            <button
              type="button"
              className={autoRounds ? "btn primary" : "btn"}
              onClick={() => setAutoRounds(true)}
            >
              Авто по уровню игроков
            </button>
            <button
              type="button"
              className={!autoRounds ? "btn primary" : "btn"}
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

          <div className="row" style={{ marginTop: 14 }}>
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

