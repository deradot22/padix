import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, EventHistoryItem, EventHistoryMatch } from "../../lib/api";

export function ProfilePage(props: { me: any }) {
  const nav = useNavigate();
  const [meLive, setMeLive] = useState<any | null>(null);
  const [history, setHistory] = useState<EventHistoryItem[] | null>(null);
  const [details, setDetails] = useState<EventHistoryMatch[] | null>(null);
  const [detailsTitle, setDetailsTitle] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  useEffect(() => {
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, nav]);

  useEffect(() => {
    if (!props.me) return;
    api
      .me()
      .then((m) => setMeLive(m))
      .catch(() => setMeLive(null));
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    api
      .myHistory()
      .then((d) => {
        if (cancelled) return;
        setHistory(d as EventHistoryItem[]);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setHistoryError(e?.message ?? "Ошибка");
      })
      .finally(() => {
        if (cancelled) return;
        setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.me]);

  if (!props.me) return null;

  const viewMe = meLive ?? props.me;
  const calibration = (viewMe.calibrationEventsRemaining ?? 0) > 0;
  const historyContent = useMemo(() => {
    if (historyLoading) return <div className="card muted">Загрузка…</div>;
    if (historyError) return <div className="error">Не удалось загрузить: {historyError}</div>;
    if (!history?.length) return <div className="card muted">История пуста — сыграй первый матч.</div>;

    const items = history.slice(0, 5);
    return (
      <div className="card">
        <div className="split">
          <h2>История матчей</h2>
          <span className="muted">по событиям</span>
        </div>
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Событие</th>
              <th>Матчей</th>
              <th>Очки</th>
              <th>Рейтинг</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.eventId}
                onClick={async () => {
                  try {
                    const res = await api.myHistoryEvent(it.eventId);
                    setDetails(res);
                    setDetailsTitle(it.eventTitle);
                  } catch (err: any) {
                    setHistoryError(err?.message ?? "Ошибка");
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <td className="muted">{it.eventDate}</td>
                <td>{it.eventTitle}</td>
                <td>{it.matchesCount}</td>
                <td>{it.totalPoints ?? "—"}</td>
                <td className={it.ratingDelta >= 0 ? "pill ok" : "pill bad"}>
                  {it.ratingDelta >= 0 ? `+${it.ratingDelta}` : it.ratingDelta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [history, historyError, historyLoading]);

  return (
    <>
      <div className="section-title">Профиль</div>
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="split">
          <h2>{viewMe.name}</h2>
          <span className="pill">{viewMe.email}</span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="pill ok">
            Рейтинг: {viewMe.rating}{" "}
            {calibration ? (
              <span title={`Рейтинг на калибровке. Осталось ${viewMe.calibrationEventsRemaining} игр.`} className="hint">
                ?
              </span>
            ) : null}
          </span>
          <span className="pill">Матчей: {viewMe.gamesPlayed}</span>
        </div>
        {calibration ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Рейтинг сейчас в калибровке: осталось <b>{viewMe.calibrationEventsRemaining}</b> калибровочных игр. После этого значок исчезнет.
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 16 }}>{historyContent}</div>
      {details ? (
        <div className="modal-overlay" onClick={() => setDetails(null)}>
          <div className="modal calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="split">
              <h2>
                Американка: {detailsTitle}
                {details?.[0]?.eventDate ? (
                  <span className="muted" style={{ fontSize: 14, marginLeft: 10 }}>
                    {details[0].eventDate}
                  </span>
                ) : null}
              </h2>
              <button className="btn" onClick={() => setDetails(null)}>Закрыть</button>
            </div>
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Раунд</th>
                  <th>Корт</th>
                  <th>Пара</th>
                  <th>Соперники</th>
                  <th>Счёт</th>
                  <th>Исход</th>
                  <th>Рейтинг</th>
                </tr>
              </thead>
              <tbody>
                {details.map((it) => (
                  <tr key={it.matchId}>
                    <td>{it.roundNumber}</td>
                    <td>{it.courtNumber}</td>
                    <td>{it.teamText}</td>
                    <td>{it.opponentText}</td>
                    <td>{it.score ?? "—"}</td>
                    <td className={it.result === "Победа" ? "pill ok" : it.result === "Поражение" ? "pill bad" : "muted"}>
                      {it.result}
                    </td>
                    <td className={it.ratingDelta == null ? "muted" : it.ratingDelta >= 0 ? "pill ok" : "pill bad"}>
                      {it.ratingDelta == null ? "—" : it.ratingDelta >= 0 ? `+${it.ratingDelta}` : it.ratingDelta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

