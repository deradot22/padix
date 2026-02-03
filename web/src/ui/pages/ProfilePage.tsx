import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, EventHistoryItem, EventHistoryMatch, EventInviteItem, FriendsSnapshot } from "../../lib/api";
import { ntrpLevel } from "../../lib/rating";

export function ProfilePage(props: { me: any; meLoaded?: boolean }) {
  const nav = useNavigate();
  const [meLive, setMeLive] = useState<any | null>(null);
  const [history, setHistory] = useState<EventHistoryItem[] | null>(null);
  const [details, setDetails] = useState<EventHistoryMatch[] | null>(null);
  const [detailsTitle, setDetailsTitle] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [friends, setFriends] = useState<FriendsSnapshot | null>(null);
  const [friendInput, setFriendInput] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [invites, setInvites] = useState<EventInviteItem[] | null>(null);
  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);

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

  useEffect(() => {
    if (!props.me) return;
    setFriendError(null);
    api
      .getFriends()
      .then(setFriends)
      .catch((e: any) => setFriendError(e?.message ?? "Ошибка друзей"));
    api
      .getInvites()
      .then(setInvites)
      .catch(() => setInvites([]));
  }, [props.me]);

  if (!props.me) {
    if (!props.meLoaded) {
      return (
        <>
          <div className="section-title">Профиль</div>
          <div className="card muted">Загрузка…</div>
        </>
      );
    }
    return (
      <>
        <div className="section-title">Профиль</div>
        <div className="card">
          <div className="split">
            <h2>Нужно войти</h2>
            <div className="row">
              <Link className="btn primary" to="/login">
                Войти
              </Link>
              <Link className="btn" to="/register">
                Регистрация
              </Link>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            Профиль доступен после авторизации.
          </div>
        </div>
      </>
    );
  }

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
        <div className="table-wrap">
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
                  <td>
                    <span className={it.ratingDelta >= 0 ? "pill ok" : "pill bad"}>
                      {it.ratingDelta >= 0 ? `+${it.ratingDelta}` : it.ratingDelta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            Рейтинг: {viewMe.rating} (NTRP {ntrpLevel(viewMe.rating)}){" "}
            {calibration ? (
              <span title={`Рейтинг на калибровке. Осталось ${viewMe.calibrationEventsRemaining} игр.`} className="hint">
                ?
              </span>
            ) : null}
          </span>
          <span className="pill">Матчей: {viewMe.gamesPlayed}</span>
          <span className="pill">ID: {viewMe.publicId}</span>
        </div>
        {calibration ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Рейтинг сейчас в калибровке: осталось <b>{viewMe.calibrationEventsRemaining}</b> калибровочных игр. После этого значок исчезнет.
          </div>
        ) : null}
      </div>
      <div className="card" style={{ marginTop: 16, maxWidth: 720 }}>
        <div className="split">
          <h2>Друзья</h2>
          <span className="muted">добавь по #ID</span>
        </div>
        <div className="row stack" style={{ marginTop: 12 }}>
          <input
            className="input"
            placeholder="Например: #123456789"
            value={friendInput}
            onChange={(e) => setFriendInput(e.target.value)}
          />
          <button
            className="btn primary"
            disabled={friendLoading || friendInput.trim().length === 0}
            onClick={async () => {
              setFriendLoading(true);
              setFriendError(null);
              try {
                await api.requestFriend(friendInput);
                setFriendInput("");
                const updated = await api.getFriends();
                setFriends(updated);
              } catch (err: any) {
                setFriendError(err?.message ?? "Ошибка отправки");
              } finally {
                setFriendLoading(false);
              }
            }}
          >
            {friendLoading ? "Отправляем…" : "Добавить"}
          </button>
        </div>
        {friendError ? <div className="error" style={{ marginTop: 10 }}>{friendError}</div> : null}

        <div className="row" style={{ marginTop: 12 }}>
          {(friends?.friends ?? []).length === 0 ? (
            <span className="muted">Пока нет друзей.</span>
          ) : (
            friends?.friends.map((f) => (
              <span key={f.userId} className="pill pill-action tooltip">
                {f.name} <span className="muted">({f.publicId})</span>
                <span className="tooltip-content">
                  <span className="tooltip-line">
                    Рейтинг: {f.rating}
                    {(f.calibrationEventsRemaining ?? 0) > 0 ? <span className="calibration-mark">?</span> : null}
                  </span>
                  <span className="tooltip-line">Матчей: {f.gamesPlayed}</span>
                </span>
              </span>
            ))
          )}
        </div>

        {(friends?.incoming ?? []).length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Входящие заявки</div>
            <div className="row">
              {friends?.incoming.map((r) => (
                <span key={r.publicId} className="pill">
                  {r.name} <span className="muted">({r.publicId})</span>
                  <button
                    className="btn"
                    style={{ marginLeft: 8 }}
                    onClick={async () => {
                      await api.acceptFriend(r.publicId);
                      const updated = await api.getFriends();
                      setFriends(updated);
                    }}
                  >
                    Принять
                  </button>
                  <button
                    className="btn"
                    style={{ marginLeft: 6 }}
                    onClick={async () => {
                      await api.declineFriend(r.publicId);
                      const updated = await api.getFriends();
                      setFriends(updated);
                    }}
                  >
                    Отклонить
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {(friends?.outgoing ?? []).length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Исходящие заявки</div>
            <div className="row">
              {friends?.outgoing.map((r) => (
                <span key={r.publicId} className="pill">
                  {r.name} <span className="muted">({r.publicId})</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="card" style={{ marginTop: 16, maxWidth: 720 }}>
        <div className="split">
          <h2>Приглашения в игры</h2>
          <span className="muted">от друзей</span>
        </div>
        {(invites ?? []).length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>Пока приглашений нет.</div>
        ) : (
          <div className="row" style={{ marginTop: 10 }}>
            {invites?.map((inv) => (
              <Link key={`${inv.eventId}-${inv.fromPublicId}`} className="pill" to={`/events/${inv.eventId}`}>
                {inv.eventTitle} • {inv.eventDate} • {inv.fromName} ({inv.fromPublicId})
              </Link>
            ))}
          </div>
        )}
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
            <div className="table-wrap">
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
                      <td className={it.ratingDelta == null ? "muted" : undefined}>
                        {it.ratingDelta == null ? (
                          "—"
                        ) : (
                          <span className={it.ratingDelta >= 0 ? "pill ok" : "pill bad"}>
                            {it.ratingDelta >= 0 ? `+${it.ratingDelta}` : it.ratingDelta}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

