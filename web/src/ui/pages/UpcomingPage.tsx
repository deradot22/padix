import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Event } from "../../lib/api";

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
    if (loading) return <div className="card muted">Загрузка…</div>;
    if (error) return <div className="error">Не удалось загрузить: {error}</div>;
    if (!list?.length) return <div className="card muted">Ближайших игр нет.</div>;

    return (
      <div className="card">
        <div className="split">
          <h2>Ближайшие игры (2 недели)</h2>
          <span className="muted">Нажми на игру, чтобы открыть корты/раунды</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Время</th>
              <th>Формат</th>
              <th>Игроки</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} onClick={() => nav(`/events/${e.id}`)} style={{ cursor: "pointer" }}>
                <td>{prettyDate(e.date)}</td>
                <td>{timeRange(e.startTime, e.endTime)}</td>
                <td>{formatLabel(e.format)}</td>
                <td>{e.registeredCount}</td>
                <td>{statusPill(e.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [error, list, loading]);

  return (
    <>
      <div className="section-title">Ближайшие игры</div>
      {props.me ? (
        <div className="row" style={{ marginBottom: 12 }}>
          <Link to="/create" className="btn primary">Создать игру</Link>
          <button className="btn" onClick={() => setShowCalendar(true)}>
            Календарь
          </button>
        </div>
      ) : null}

      {listContent}

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

