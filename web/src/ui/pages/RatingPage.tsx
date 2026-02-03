import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, Player } from "../../lib/api";
import { ntrpLevel } from "../../lib/rating";

export function RatingPage(props: { authed: boolean }) {
  const [data, setData] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getRating()
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(() => {
    if (loading) return <div className="card muted">Загрузка…</div>;
    if (error) return <div className="error">Не удалось загрузить: {error}</div>;
    if (!data?.length) return <div className="card muted">Пока нет участников.</div>;

    return (
      <div className="card">
        <div className="split">
          <h2>Рейтинг</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Рейтинг</th>
              <th>NTRP</th>
                <th>Матчей</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p, idx) => (
                <tr key={p.id}>
                  <td className="muted">{idx + 1}</td>
                  <td>
                    <span className="pill pill-action tooltip">
                      {p.name}
                      <span className="tooltip-content">
                        <span className="tooltip-line">
                          Рейтинг: {p.rating}
                          {(p.calibrationEventsRemaining ?? 0) > 0 ? <span className="calibration-mark">?</span> : null}
                        </span>
                        <span className="tooltip-line">Матчей: {p.gamesPlayed}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    {p.rating}
                    {(p.calibrationEventsRemaining ?? 0) > 0 ? <span className="calibration-mark">?</span> : null}
                  </td>
                <td className="muted">{ntrpLevel(p.rating)}</td>
                  <td className="muted">{p.gamesPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }, [data, error, loading]);

  return (
    <>
      <div className="section-title">Рейтинг</div>
      {!props.authed ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="split">
            <h2>Чтобы видеть игры и участвовать — нужно зарегистрироваться</h2>
            <div className="row">
              <Link className="btn primary" to="/register">
                Регистрация
              </Link>
              <Link className="btn" to="/login">
                Войти
              </Link>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            До регистрации доступен только рейтинг. После регистрации будет опрос, который даст стартовый рейтинг.
          </div>
        </div>
      ) : null}
      {content}
    </>
  );
}

