import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Event, Player } from "../../lib/api";

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function statusPill(status: Event["status"]) {
  switch (status) {
    case "DRAFT":
      return <span className="pill">Черновик</span>;
    case "OPEN_FOR_REGISTRATION":
      return <span className="pill ok">Регистрация</span>;
    case "REGISTRATION_CLOSED":
      return <span className="pill warn">Регистрация закрыта</span>;
    case "IN_PROGRESS":
      return <span className="pill warn">Идёт</span>;
    case "FINISHED":
      return <span className="pill">Завершено</span>;
    case "CANCELLED":
      return <span className="pill bad">Отменено</span>;
    default:
      return <span className="pill">{status}</span>;
  }
}

function formatLabel(format: Event["format"]) {
  switch (format) {
    case "AMERICANA":
      return "Американка";
    default:
      return format;
  }
}

function prettyDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "long" });
}

function timeRange(startTime?: string, endTime?: string): string {
  const start = startTime?.slice(0, 5) ?? "—";
  const end = endTime?.slice(0, 5);
  return end ? `${start}–${end}` : start;
}

export function UpcomingPage(props: { requireAuth?: boolean; me: any }) {
  const nav = useNavigate();
  const [list, setList] = useState<Event[] | null>(null);
  const [monthEvents, setMonthEvents] = useState<Event[] | null>(null);
  const [ratingList, setRatingList] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (props.requireAuth && !props.me) return;
    if (props.me && !props.me.surveyCompleted) return;
    setLoading(true);
    setError(null);
    const now = new Date();
    const from = formatDate(now);
    const to = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
    api
      .getUpcomingEvents(from, to)
      .then(setList)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [props.me, props.requireAuth]);

  useEffect(() => {
    api
      .getRating()
      .then((d) => setRatingList(d))
      .catch(() => setRatingList([]));
  }, []);

  useEffect(() => {
    if (props.requireAuth && !props.me) return;
    if (props.me && !props.me.surveyCompleted) return;
    const from = formatDate(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1));
    const to = formatDate(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0));
    api
      .getUpcomingEvents(from, to)
      .then(setMonthEvents)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Ошибка"));
  }, [monthCursor, props.me, props.requireAuth]);

  const days = useMemo(() => {
    const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const leading = (start.getDay() + 6) % 7; // Monday=0
    const total = end.getDate();
    const result: Date[] = [];
    for (let i = 0; i < leading; i++) result.push(new Date(start.getFullYear(), start.getMonth(), -leading + i + 1));
    for (let d = 1; d <= total; d++) result.push(new Date(start.getFullYear(), start.getMonth(), d));
    while (result.length % 7 !== 0) {
      const last = result[result.length - 1];
      result.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
    }
    return result;
  }, [monthCursor]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    (monthEvents ?? []).forEach((e) => {
      const key = e.date;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return map;
  }, [monthEvents]);

  const eventsByHour = useMemo(() => {
    if (!selectedDate) return [];
    const items = (eventsByDate.get(selectedDate) ?? []).slice();
    items.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const groups = new Map<string, Event[]>();
    items.forEach((e) => {
      const hour = e.startTime.slice(0, 2);
      const arr = groups.get(hour) ?? [];
      arr.push(e);
      groups.set(hour, arr);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [eventsByDate, selectedDate]);

  const listContent = useMemo(() => {
    if (loading) return <div className="section-card muted">Загрузка…</div>;
    if (error) return <div className="error">Не удалось загрузить: {error}</div>;
    if (!list?.length) return <div className="section-card muted">Ближайших игр нет.</div>;

    return (
      <div className="event-list">
        {list.map((e) => (
          <div key={e.id} className="event-item">
            <div className="event-main">
              <div className="event-title">{formatLabel(e.format)}</div>
              <div className="event-meta">
                <span>🕒 {prettyDate(e.date)}</span>
                <span>{timeRange(e.startTime, e.endTime)}</span>
                <span>👥 {e.registeredCount}</span>
              </div>
            </div>
            <div className="event-actions">
              {statusPill(e.status)}
              <button className="btn primary" onClick={() => nav(`/events/${e.id}`)}>
                Вступить
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }, [error, list, loading, nav]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayIso = formatDate(now);
    const gamesToday = (list ?? []).filter((e) => e.date === todayIso).length;
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const gamesWeek = (list ?? []).filter((e) => {
      const d = new Date(e.date);
      return d >= now && d <= weekEnd;
    }).length;
    const activePlayers = ratingList?.length ?? 0;
    return { activePlayers, gamesToday, gamesWeek };
  }, [list, ratingList]);

  return (
    <>
      <div className="hero-card">
        <div className="hero-badge">⚡ Сезон {new Date().getFullYear()}</div>
        <h1 className="hero-title">
          Добро пожаловать в <span className="accent">padix</span>
        </h1>
        <div className="hero-subtitle">
          Организуйте игры в падел, следите за рейтингом и находите партнёров для игры.
        </div>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => document.getElementById("upcoming")?.scrollIntoView({ behavior: "smooth" })}>
            Найти игру
          </button>
          {props.me ? (
            <Link to="/create" className="btn">Создать игру →</Link>
          ) : (
            <Link to="/register" className="btn">Создать игру →</Link>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.activePlayers}</div>
          <div className="stat-label">Активных игроков</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.gamesToday}</div>
          <div className="stat-label">Игр сегодня</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.gamesWeek}</div>
          <div className="stat-label">Игр за неделю</div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, gap: 16 }}>
        <div className="section-card" style={{ flex: 1 }} id="upcoming">
          <div className="section-header">
            <div className="section-title-row">📅 Ближайшие игры</div>
            <div className="section-actions">
              {props.me ? <Link to="/create" className="btn">Создать игру</Link> : null}
              <button className="btn" onClick={() => setShowCalendar(true)}>Календарь</button>
            </div>
          </div>
          {listContent}
        </div>

        <div className="section-card" style={{ flex: 1 }}>
          <div className="section-header">
            <div className="section-title-row">🏆 Топ игроков</div>
            <Link to="/rating" className="btn">Полный рейтинг →</Link>
          </div>
          {!ratingList?.length ? (
            <div className="muted">Пока нет участников.</div>
          ) : (
            <div className="top-list">
              {ratingList.slice(0, 3).map((p, idx) => (
                <div key={p.id} className="top-item">
                  <span className="top-rank">{idx + 1}</span>
                  <span className="pill pill-action tooltip">
                    {p.name}
                    <span className="tooltip-content">
                      <span className="tooltip-line">Рейтинг: {p.rating}</span>
                      <span className="tooltip-line">Матчей: {p.gamesPlayed}</span>
                    </span>
                  </span>
                  <span className="top-score">{p.rating}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCalendar ? (
        <div className="modal-overlay" onClick={() => setShowCalendar(false)}>
          <div className="modal calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="split">
              <h2>Календарь</h2>
              <button className="btn" onClick={() => setShowCalendar(false)}>Закрыть</button>
            </div>
            {!selectedDate ? (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>
                  ←
                </button>
                <span className="pill">{monthLabel(monthCursor)}</span>
                <button className="btn" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>
                  →
                </button>
              </div>
            ) : null}
            {!selectedDate ? (
              <div className="grid calendar-grid calendar-modal-grid" style={{ marginTop: 12 }}>
                {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => (
                  <div key={d} className="calendar-head muted">{d}</div>
                ))}
                {days.map((d, idx) => {
                  const key = formatDate(d);
                  const inMonth = d.getMonth() === monthCursor.getMonth();
                  const ev = eventsByDate.get(key) ?? [];
                  return (
                    <button
                      key={`${key}-${idx}`}
                      className="card calendar-day calendar-day--button"
                      style={{ opacity: inMonth ? 1 : 0.5 }}
                      onClick={() => setSelectedDate(key)}
                    >
                      <div className="calendar-day__date muted">{d.getDate()}</div>
                      <div className="calendar-day__events">
                        {ev.length > 0 ? (
                          <span className="calendar-day__count">{ev.length} игр</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="calendar-hours">
                <div className="split">
                  <h2>{`Расписание на ${selectedDate}`}</h2>
                  <button className="btn" onClick={() => setSelectedDate(null)}>Назад</button>
                </div>
                {eventsByHour.length === 0 ? (
                  <div className="card muted" style={{ marginTop: 8 }}>В этот день игр нет.</div>
                ) : (
                  <div className="calendar-hours__list" style={{ marginTop: 8 }}>
                    {eventsByHour.map(([hour, items]) => (
                      <div key={hour} className="card calendar-hours__item">
                        <div className="calendar-hours__title">{hour}:00</div>
                        <div className="calendar-hours__events">
                          {items.map((e) => (
                          <Link key={e.id} className="calendar-hours__event" to={`/events/${e.id}`}>
                            {e.title} • {timeRange(e.startTime, e.endTime)}
                          </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

