import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  EventDetails,
  EventInviteStatusItem,
  FriendItem,
  FriendsSnapshot,
  InviteStatus,
  Match,
  Player,
  ScoringMode,
} from "../../lib/api";

function matchTitle(m: Match) {
  const a = m.teamA.map((p) => p.name).join(" + ");
  const b = m.teamB.map((p) => p.name).join(" + ");
  return `${a}  vs  ${b}`;
}

function scoreText(mode: ScoringMode, m: Match) {
  if (!m.score) return "—";
  if (mode === "POINTS" && m.score.points) return `${m.score.points.teamAPoints}:${m.score.points.teamBPoints}`;
  if (mode === "SETS" && m.score.sets?.length) {
    return m.score.sets.map((s) => `${s.teamAGames}:${s.teamBGames}`).join("  ");
  }
  return "—";
}

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Черновик";
    case "OPEN_FOR_REGISTRATION":
      return "Регистрация";
    case "REGISTRATION_CLOSED":
      return "Регистрация закрыта";
    case "IN_PROGRESS":
      return "Идёт";
    case "FINISHED":
      return "Завершено";
    case "CANCELLED":
      return "Отменено";
    default:
      return status;
  }
}

function pairingLabel(mode?: string): string {
  if (mode === "BALANCED") return "Равный бой";
  return "Каждый с каждым";
}

function formatEventDate(dateStr: string): string {
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateStr;
  return `${d} ${months[m - 1] ?? ""}`;
}

export function EventPage(props: { me: any }) {
  const { eventId } = useParams();
  const [data, setData] = useState<EventDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitePublicId, setInvitePublicId] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendsSnapshot["friends"]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [eventInvites, setEventInvites] = useState<EventInviteStatusItem[]>([]);
  const [eventInvitesLoading, setEventInvitesLoading] = useState(false);
  const [eventInvitesError, setEventInvitesError] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [inviteSelected, setInviteSelected] = useState<Set<string>>(new Set());
  const [registering, setRegistering] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [roundModalOpen, setRoundModalOpen] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundScores, setRoundScores] = useState<Record<string, { a: string; b: string }>>({});
  const [savingRound, setSavingRound] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!props.me) return;
    if (props.me && !props.me.surveyCompleted) return;
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .getEventDetails(eventId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, props.me]);

  useEffect(() => {
    if (!props.me) return;
    if (!data?.isAuthor) return;
    if (!inviteModalOpen && friends.length > 0) return;
    setFriendsLoading(true);
    setFriendsError(null);
    api
      .getFriends()
      .then((snapshot) => setFriends(snapshot.friends ?? []))
      .catch((e: any) => {
        setFriendsError(e?.message ?? "Ошибка загрузки друзей");
        setFriends([]);
      })
      .finally(() => setFriendsLoading(false));
  }, [data?.isAuthor, props.me, inviteModalOpen, friends.length]);

  useEffect(() => {
    if (!props.me) return;
    if (!data?.isAuthor) return;
    if (!inviteModalOpen) return;
    if (!eventId) return;
    setEventInvitesLoading(true);
    setEventInvitesError(null);
    api
      .getEventInvites(eventId)
      .then((items) => setEventInvites(items ?? []))
      .catch((e: any) => {
        setEventInvitesError(e?.message ?? "Ошибка загрузки приглашений");
        setEventInvites([]);
      })
      .finally(() => setEventInvitesLoading(false));
  }, [data?.isAuthor, props.me, inviteModalOpen, eventId]);

  async function inviteSelectedFriends() {
    if (inviteSelected.size === 0) return;
    if (!eventId) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      for (const publicId of inviteSelected) {
        await api.inviteFriendToEvent(eventId, publicId);
      }
      setInviteSelected(new Set());
      setInfo("Приглашения отправлены.");
      const refreshed = await api.getEventInvites(eventId);
      setEventInvites(refreshed ?? []);
    } catch (err: any) {
      setInviteError(err?.message ?? "Ошибка приглашения");
    } finally {
      setInviteLoading(false);
    }
  }

  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    return friends.filter((f) => {
      if (!q) return true;
      const name = String(f.name ?? "").toLowerCase();
      const pid = String(f.publicId ?? "").toLowerCase();
      return name.includes(q) || pid.includes(q);
    });
  }, [friends, friendSearch]);

  const inviteStatusByPublicId = useMemo(() => {
    return new Map(eventInvites.map((i) => [i.publicId, i.status]));
  }, [eventInvites]);

  function inviteStatusLabel(status?: InviteStatus): string | null {
    if (!status) return null;
    if (status === "ACCEPTED") return "принято";
    if (status === "DECLINED") return "отклонено";
    return "отправлено";
  }

  const content = useMemo(() => {
    if (loading) return <div className="card muted">Загрузка…</div>;
    if (loadError) return <div className="error">Не удалось загрузить: {loadError}</div>;
    if (!data) return <div className="card muted">Событие не найдено.</div>;

    const e = data.event;
    const registered = data.registeredPlayers ?? [];
    const pending = data.pendingCancelRequests ?? [];
    const meId = props.me?.playerId;
    const isRegistered = !!meId && registered.some((p) => p.id === meId);
    const isAuthor = data.isAuthor;
    const firstIncomplete = data.rounds.findIndex((r) => r.matches.some((m) => m.status !== "FINISHED"));
    const activeRoundIndex = firstIncomplete >= 0 ? firstIncomplete : 0;
    const expectedTotal = e.pointsPerPlayerPerMatch * 4;
    return (
      <>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="split">
            <h2>{e.title}</h2>
            <div className="row">
              <span className="pill">{formatEventDate(e.date)}</span>
              <span className="pill">
                {e.startTime.slice(0, 5)}–{e.endTime.slice(0, 5)}
              </span>
              <span className="pill">{statusLabel(e.status)}</span>
              {isAuthor ? (
                <span className="pill ok">Вы автор</span>
              ) : (
                <span className="pill">Автор: {data.authorName}</span>
              )}
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="pill">Кортов: {e.courtsCount}</span>
            <span className="pill">Режим: {pairingLabel(e.pairingMode)}</span>
            {e.scoringMode === "POINTS" ? (
              <span className="pill">Подач на игрока: {e.pointsPerPlayerPerMatch}</span>
            ) : (
              <span className="pill">Сетов: {e.setsPerMatch}</span>
            )}
            {e.status === "OPEN_FOR_REGISTRATION" || e.status === "REGISTRATION_CLOSED" ? (
              <>
                {isRegistered ? (
                  <>
                    <span className="pill ok">Вы записаны</span>
                    <button
                      className="btn"
                      disabled={canceling}
                      onClick={async () => {
                        if (!meId) return;
                        setCanceling(true);
                        setInfo(null);
                        try {
                          const res = await api.cancelRegistration(e.id);
                          setInfo(res.message);
                          const refreshed = await api.getEventDetails(e.id);
                          setData(refreshed);
                        } catch (err: any) {
                        setActionError(err?.message ?? "Ошибка отмены");
                        } finally {
                          setCanceling(false);
                        }
                      }}
                    >
                      {canceling ? "Отмена…" : "Отменить запись"}
                    </button>
                  </>
                ) : (
                  e.status === "OPEN_FOR_REGISTRATION" ? (
                    <button
                      className="btn primary"
                      disabled={registering}
                      onClick={async () => {
                        if (!meId) return;
                        setRegistering(true);
                        try {
                          await api.registerForEvent(e.id, meId);
                          const refreshed = await api.getEventDetails(e.id);
                          setData(refreshed);
                        } catch (err: any) {
                        setActionError(err?.message ?? "Ошибка регистрации");
                        } finally {
                          setRegistering(false);
                        }
                      }}
                    >
                      {registering ? "Запись…" : "Записаться"}
                    </button>
                  ) : (
                    <span className="pill warn">Регистрация закрыта</span>
                  )
                )}
                {isAuthor && e.status === "OPEN_FOR_REGISTRATION" ? (
                  <button
                    className="btn"
                    disabled={closing}
                    onClick={async () => {
                      setClosing(true);
                      setInfo(null);
                      try {
                        await api.closeRegistration(e.id);
                        const refreshed = await api.getEventDetails(e.id);
                        setData(refreshed);
                      } catch (err: any) {
                        setActionError(err?.message ?? "Ошибка закрытия");
                      } finally {
                        setClosing(false);
                      }
                    }}
                  >
                    {closing ? "Закрываем…" : "Закрыть регистрацию"}
                  </button>
                ) : null}
                {isAuthor && e.status === "REGISTRATION_CLOSED" ? (
                  <button
                    className="btn primary"
                    disabled={starting}
                    onClick={async () => {
                      setStarting(true);
                      setInfo(null);
                      try {
                        await api.startEvent(e.id);
                        const refreshed = await api.getEventDetails(e.id);
                        setData(refreshed);
                        setRoundIndex(activeRoundIndex);
                        setRoundScores({});
                        setRoundModalOpen(true);
                      } catch (err: any) {
                        setActionError(err?.message ?? "Ошибка старта");
                      } finally {
                        setStarting(false);
                      }
                    }}
                  >
                    {starting ? "Стартуем…" : "Начать игру"}
                  </button>
                ) : null}
              </>
            ) : null}
            {isAuthor && e.status === "IN_PROGRESS" ? (
              <button
                className="btn primary"
                onClick={() => {
                  setRoundIndex(activeRoundIndex);
                  setRoundScores({});
                  setRoundModalOpen(true);
                }}
              >
                Открыть раунды
              </button>
            ) : null}
          </div>
          {isAuthor ? (
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setInviteModalOpen(true)}>
                Пригласить друга
              </button>
              {inviteError ? <div className="error" style={{ marginTop: 8 }}>{inviteError}</div> : null}
            </div>
          ) : null}
          {info ? <div className="muted" style={{ marginTop: 8 }}>{info}</div> : null}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="split">
            <h2>Участники</h2>
            <span className="pill">{registered.length} записались</span>
          </div>
          {registered.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>Пока никто не зарегистрировался.</div>
          ) : (
            <div className="row" style={{ marginTop: 10 }}>
              {registered.map((p) => (
                <span key={p.id} className="pill pill-action tooltip">
                  {p.name}
                  <span className="tooltip-content">
                    <span className="tooltip-line">
                      Рейтинг: {p.rating}
                      {(p.calibrationEventsRemaining ?? 0) > 0 ? <span className="calibration-mark">?</span> : null}
                    </span>
                    <span className="tooltip-line">Матчей: {p.gamesPlayed}</span>
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {isAuthor && pending.length > 0 ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="split">
              <h2>Запросы на отмену</h2>
              <span className="pill">{pending.length}</span>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              {pending.map((p) => (
                <span key={p.id} className="pill">
                  {p.name} <span className="muted">({p.rating})</span>
                  <button
                    className="btn"
                    style={{ marginLeft: 8 }}
                    onClick={async () => {
                      try {
                        await api.approveCancel(e.id, p.id);
                        const refreshed = await api.getEventDetails(e.id);
                        setData(refreshed);
                      } catch (err: any) {
                        setActionError(err?.message ?? "Ошибка подтверждения");
                      }
                    }}
                  >
                    Подтвердить
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="row" style={{ margin: "8px 0 12px" }}>
          {isAuthor && e.status === "IN_PROGRESS" ? (
            <button
              className="btn primary"
              onClick={() => {
                setRoundIndex(activeRoundIndex);
                setRoundScores({});
                setRoundModalOpen(true);
              }}
            >
              Ввести счёт
            </button>
          ) : null}
        </div>

        {data.rounds.map((r) => (
          <div key={r.id} className="card" style={{ marginBottom: 16 }}>
            <div className="split">
              <h2>Раунд {r.roundNumber}</h2>
              <span className="muted">Матчей: {r.matches.length}</span>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Корт</th>
                    <th>Матч</th>
                    <th>Счёт</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {r.matches.map((m) => (
                    <tr key={m.id}>
                      <td>{m.courtNumber}</td>
                      <td className="muted">{matchTitle(m)}</td>
                      <td>{scoreText(e.scoringMode, m)}</td>
                      <td className="muted">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {roundModalOpen && data.rounds[roundIndex] ? (
          <div className="modal-overlay">
            <div className="modal calendar-modal">
              <div className="split">
                <h2>Раунд {data.rounds[roundIndex].roundNumber}</h2>
                <button className="btn" onClick={() => setRoundModalOpen(false)}>Закрыть</button>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                На каждом корте всего {expectedTotal} очков (по {e.pointsPerPlayerPerMatch} на игрока).
              </div>
              <div style={{ marginTop: 12 }}>
                {data.rounds[roundIndex].matches.map((m) => (
                  <div key={m.id} className="card" style={{ marginBottom: 12 }}>
                    <div className="muted" style={{ marginBottom: 8 }}>
                      Корт {m.courtNumber}
                    </div>
                    <div className="muted" style={{ marginBottom: 8 }}>{matchTitle(m)}</div>
                    <div className="row">
                      <select
                        className="input"
                        value={roundScores[m.id]?.a ?? ""}
                        onChange={(ev) =>
                          setRoundScores((prev) => {
                            const nextA = ev.target.value;
                            const prevB = prev[m.id]?.b ?? "";
                            const shouldAuto =
                              prevB === "" && nextA !== "" && !Number.isNaN(Number(nextA));
                            const autoB = shouldAuto ? `${expectedTotal - Number(nextA)}` : prevB;
                            return {
                              ...prev,
                              [m.id]: { a: nextA, b: autoB },
                            };
                          })
                        }
                      >
                        <option value="">Команда A</option>
                        {Array.from({ length: expectedTotal + 1 }).map((_, n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <span className="muted">:</span>
                      <select
                        className="input"
                        value={roundScores[m.id]?.b ?? ""}
                        onChange={(ev) =>
                          setRoundScores((prev) => {
                            const nextB = ev.target.value;
                            const prevA = prev[m.id]?.a ?? "";
                            const shouldAuto =
                              prevA === "" && nextB !== "" && !Number.isNaN(Number(nextB));
                            const autoA = shouldAuto ? `${expectedTotal - Number(nextB)}` : prevA;
                            return {
                              ...prev,
                              [m.id]: { a: autoA, b: nextB },
                            };
                          })
                        }
                      >
                        <option value="">Команда B</option>
                        {Array.from({ length: expectedTotal + 1 }).map((_, n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn primary"
                  disabled={savingRound}
                  onClick={async () => {
                    if (!data.rounds[roundIndex]) return;
                    const matches = data.rounds[roundIndex].matches;
                    try {
                      setSavingRound(true);
                      for (const m of matches) {
                        const s = roundScores[m.id];
                        const a = s ? Number(s.a) : NaN;
                        const b = s ? Number(s.b) : NaN;
                        if (Number.isNaN(a) || Number.isNaN(b)) {
                          throw new Error("Заполни счёт для всех кортов");
                        }
                        if (a + b !== expectedTotal) {
                          throw new Error(`Сумма очков должна быть ${expectedTotal}`);
                        }
                      }
                      await Promise.all(
                        matches.map((m) => {
                          const s = roundScores[m.id];
                          return api.submitScore(m.id, { teamAPoints: Number(s.a), teamBPoints: Number(s.b) });
                        })
                      );
                      const refreshed = await api.getEventDetails(e.id);
                      setData(refreshed);
                      if (roundIndex >= refreshed.rounds.length - 1) {
                        await api.finishEvent(e.id);
                        const finished = await api.getEventDetails(e.id);
                        setData(finished);
                        setRoundModalOpen(false);
                      } else {
                        setRoundIndex(roundIndex + 1);
                        setRoundScores({});
                      }
                    } catch (err: any) {
                      setActionError(err?.message ?? "Ошибка сохранения");
                    } finally {
                      setSavingRound(false);
                    }
                  }}
                >
                  {savingRound
                    ? "Сохраняем…"
                    : roundIndex >= data.rounds.length - 1
                      ? "Завершить игру"
                      : "Следующий раунд"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }, [
    data,
    loadError,
    loading,
    friends,
    friendsError,
    friendsLoading,
    registering,
    canceling,
    closing,
    starting,
    roundModalOpen,
    roundIndex,
    roundScores,
    savingRound,
    info,
    props.me,
    invitePublicId,
    inviteLoading,
    inviteError,
    inviteModalOpen,
    friendSearch,
  ]);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link to="/" className="btn">
          ← Назад
        </Link>
      </div>
      <div className="section-title">Событие</div>
      {content}
      {inviteModalOpen ? (
        <div className="modal-overlay" onClick={() => setInviteModalOpen(false)}>
          <div className="modal invite-modal" onClick={(e) => e.stopPropagation()}>
            <div className="split">
              <h2 style={{ margin: 0 }}>Пригласить друга</h2>
              <button className="btn" onClick={() => setInviteModalOpen(false)}>Закрыть</button>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Поиск по имени или #ID
            </div>
            <input
              className="input"
              style={{ marginTop: 10 }}
              placeholder="Начни вводить имя или #ID"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn primary"
                type="button"
                disabled={inviteLoading || inviteSelected.size === 0}
                onClick={async () => {
                  await inviteSelectedFriends();
                  setInviteModalOpen(false);
                  setFriendSearch("");
                }}
              >
                {inviteLoading ? "Приглашаем…" : `Пригласить (${inviteSelected.size})`}
              </button>
              <button
                className="btn"
                type="button"
                disabled={inviteLoading || inviteSelected.size === 0}
                onClick={() => setInviteSelected(new Set())}
              >
                Снять выбор
              </button>
            </div>
            {friendsLoading || eventInvitesLoading ? (
              <div className="muted" style={{ marginTop: 10 }}>Загрузка друзей…</div>
            ) : friendsError || eventInvitesError ? (
              <div className="error" style={{ marginTop: 10 }}>
                {friendsError ?? eventInvitesError}
              </div>
            ) : friendsError ? (
              <div className="error" style={{ marginTop: 10 }}>{friendsError}</div>
            ) : filteredFriends.length === 0 ? (
              <div className="muted" style={{ marginTop: 10 }}>Ничего не найдено.</div>
            ) : (
              <div className="invite-list">
                {filteredFriends.map((f: FriendItem) => {
                  const status = inviteStatusByPublicId.get(f.publicId);
                  const statusLabel = inviteStatusLabel(status);
                  const disabled = inviteLoading || !!status;
                  return (
                    <button
                      key={f.userId}
                      className={`invite-item ${inviteSelected.has(f.publicId) ? "is-selected" : ""}`}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        setInviteSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.publicId)) next.delete(f.publicId);
                          else next.add(f.publicId);
                          return next;
                        })
                      }
                    >
                      <span className="invite-main">
                        <span>{f.name}</span>
                        <span className="muted">{f.publicId}</span>
                      </span>
                      <span className="invite-meta">
                        {statusLabel ? <span className="invite-status">{statusLabel}</span> : null}
                        {inviteSelected.has(f.publicId) ? <span className="invite-check">✓</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {actionError ? (
        <div className="modal-overlay" onClick={() => setActionError(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="split">
              <h2 style={{ margin: 0 }}>Ошибка</h2>
              <button className="btn" onClick={() => setActionError(null)}>Закрыть</button>
            </div>
            <div className="error" style={{ marginTop: 12 }}>{actionError}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

