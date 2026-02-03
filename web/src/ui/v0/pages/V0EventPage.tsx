import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, MapPin, Share2, Target, UserPlus, Users, Zap } from "lucide-react";
import { api, EventDetails, FriendItem, FriendsSnapshot, Match, ScoringMode } from "../../../lib/api";
import { PlayerTooltip } from "@/components/player-tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatEventDate, timeRange } from "../utils";

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

export function V0EventPage(props: { me: any; meLoaded?: boolean }) {
  const { eventId } = useParams();
  const [data, setData] = useState<EventDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<FriendsSnapshot | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreMatch, setScoreMatch] = useState<Match | null>(null);
  const [scoreA, setScoreA] = useState<string>("");
  const [scoreB, setScoreB] = useState<string>("");
  const [scoreSaving, setScoreSaving] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreAutoFilled, setScoreAutoFilled] = useState(false);

  useEffect(() => {
    if (!inviteOpen) return;
    if (!props.me) return;
    setFriendsError(null);
    api
      .getFriends()
      .then(setFriends)
      .catch((e: any) => setFriendsError(e?.message ?? "Ошибка загрузки друзей"));
  }, [inviteOpen, props.me]);

  function openScoreDialog(m: Match) {
    setScoreMatch(m);
    setScoreError(null);
    const points = m.score?.points;
    setScoreA(points ? String(points.teamAPoints) : "");
    setScoreB(points ? String(points.teamBPoints) : "");
    setScoreAutoFilled(false);
    setScoreOpen(true);
  }

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

  const content = useMemo(() => {
    if (!props.me) {
      if (!props.meLoaded) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
      return (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">Нужно войти, чтобы открыть игру.</div>
          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Войти
          </Link>
        </div>
      );
    }
    if (loading) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
    if (loadError)
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Не удалось загрузить: {loadError}
        </div>
      );
    if (!data) return <div className="text-sm text-muted-foreground">Событие не найдено.</div>;

    const e = data.event;
    const registered = data.registeredPlayers ?? [];
    const meId = props.me?.playerId;
    const isRegistered = !!meId && registered.some((p) => p.id === meId);
    const isAuthor = data.isAuthor;
    const progressPercent = Math.min(100, (registered.length / Math.max(1, e.courtsCount * 4)) * 100);

    return (
      <div className="space-y-8">
        <Link
          to="/games"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>Назад к играм</span>
        </Link>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-border/50">
          <div className="relative p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="space-y-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
                    {statusLabel(e.status)}
                  </span>
                  {isAuthor ? (
                    <span className="inline-flex items-center rounded-md border border-primary/50 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      Вы автор
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                      Автор: {data.authorName}
                    </span>
                  )}
                </div>

                <div>
                  <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">{e.title}</h1>
                  <p className="text-muted-foreground mt-2 text-lg">{formatEventDate(e.date)}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="font-medium">{timeRange(e.startTime, e.endTime)}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="font-medium">{e.courtsCount} корта</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {e.status === "OPEN_FOR_REGISTRATION" || e.status === "REGISTRATION_CLOSED" ? (
                  <>
                    {isRegistered ? (
                      <button
                        type="button"
                        className="h-12 px-6 rounded-md border border-primary bg-primary/10 text-primary text-base font-medium hover:bg-primary/20 transition-colors inline-flex items-center justify-center"
                        disabled={canceling}
                        onClick={async () => {
                          if (!eventId) return;
                          setCanceling(true);
                          setActionError(null);
                          setInfo(null);
                          try {
                            const res = await api.cancelRegistration(eventId);
                            setInfo(res.message);
                            const refreshed = await api.getEventDetails(eventId);
                            setData(refreshed);
                          } catch (err: any) {
                            setActionError(err?.message ?? "Ошибка отмены");
                          } finally {
                            setCanceling(false);
                          }
                        }}
                      >
                        <Check className="h-5 w-5 mr-2" />
                        {canceling ? "Отмена…" : "Вы записаны (отменить)"}
                      </button>
                    ) : e.status === "OPEN_FOR_REGISTRATION" ? (
                      <button
                        type="button"
                        className="h-12 px-6 rounded-md bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors"
                        disabled={registering}
                        onClick={async () => {
                          if (!eventId) return;
                          if (!meId) return;
                          setRegistering(true);
                          setActionError(null);
                          try {
                            await api.registerForEvent(eventId, meId);
                            const refreshed = await api.getEventDetails(eventId);
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
                      <div className="text-sm text-muted-foreground">Регистрация закрыта</div>
                    )}

                    <div className="flex gap-2">
                      {isAuthor && e.status === "OPEN_FOR_REGISTRATION" ? (
                        <button
                          type="button"
                          className="flex-1 h-11 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
                          disabled={closing}
                          onClick={async () => {
                            if (!eventId) return;
                            setClosing(true);
                            setActionError(null);
                            setInfo(null);
                            try {
                              await api.closeRegistration(eventId);
                              const refreshed = await api.getEventDetails(eventId);
                              setData(refreshed);
                              setInfo("Регистрация закрыта");
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
                          type="button"
                          className="flex-1 h-11 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center justify-center"
                          disabled={starting}
                          onClick={async () => {
                            if (!eventId) return;
                            setStarting(true);
                            setActionError(null);
                            setInfo(null);
                            try {
                              await api.startEvent(eventId);
                              const refreshed = await api.getEventDetails(eventId);
                              setData(refreshed);
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

                      <button
                        type="button"
                        className="h-11 w-11 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                        title="Пригласить"
                        aria-label="Пригласить"
                        onClick={() => setInviteOpen(true)}
                      >
                        <UserPlus className="h-4 w-4" />
                      </button>
                    </div>

                    {info ? <div className="text-sm text-muted-foreground">{info}</div> : null}
                    {actionError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        {actionError}
                      </div>
                    ) : null}
                  </>
                ) : e.status === "IN_PROGRESS" ? (
                  <>
                    {isAuthor ? (
                      <button
                        type="button"
                        className="h-12 px-6 rounded-md bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors"
                        disabled={finishing}
                        onClick={async () => {
                          if (!eventId) return;
                          setFinishing(true);
                          setActionError(null);
                          setInfo(null);
                          try {
                            await api.finishEvent(eventId);
                            const refreshed = await api.getEventDetails(eventId);
                            setData(refreshed);
                            setInfo("Игра завершена. Рейтинг обновится автоматически.");
                          } catch (err: any) {
                            setActionError(err?.message ?? "Ошибка завершения");
                          } finally {
                            setFinishing(false);
                          }
                        }}
                      >
                        {finishing ? "Завершаем…" : "Завершить игру"}
                      </button>
                    ) : (
                      <div className="text-sm text-muted-foreground">Игра идёт</div>
                    )}

                    {info ? <div className="text-sm text-muted-foreground">{info}</div> : null}
                    {actionError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        {actionError}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Статус: {statusLabel(e.status)}</div>
                )}

                <button
                  type="button"
                  className="text-muted-foreground text-sm inline-flex items-center justify-center hover:text-foreground"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setInfo("Ссылка скопирована");
                    } catch {
                      setInfo(window.location.href);
                    }
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Поделиться
                </button>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Пригласить друзей</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-4">
              {friendsError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{friendsError}</div>
              ) : null}
              {(friends?.friends ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">Пока нет друзей для приглашения.</div>
              ) : (
                (friends?.friends ?? []).map((friend: FriendItem) => (
                  <div
                    key={friend.userId}
                    className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-semibold">
                        {friend.name?.[0]?.toUpperCase?.() ?? "?"}
                      </div>
                      <div>
                        <p className="font-medium">{friend.name}</p>
                        <p className="text-sm text-muted-foreground">Рейтинг: {friend.rating}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={invited[friend.publicId] ? "default" : "outline"}
                      disabled={!eventId || invitingId === friend.publicId}
                      onClick={async () => {
                        if (!eventId) return;
                        setInvitingId(friend.publicId);
                        try {
                          await api.inviteFriendToEvent(eventId, friend.publicId);
                          setInvited((m) => ({ ...m, [friend.publicId]: true }));
                        } catch (e: any) {
                          setFriendsError(e?.message ?? "Ошибка приглашения");
                        } finally {
                          setInvitingId(null);
                        }
                      }}
                    >
                      {invited[friend.publicId] ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Отправлено
                        </>
                      ) : (
                        "Пригласить"
                      )}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Корты</span>
            </div>
            <p className="text-2xl font-bold">{e.courtsCount}</p>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="h-4 w-4" />
              <span className="text-sm">Режим</span>
            </div>
            <p className="text-lg font-bold">{pairingLabel(e.pairingMode)}</p>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="h-4 w-4" />
              <span className="text-sm">{e.scoringMode === "POINTS" ? "Подач на игрока" : "Сетов"}</span>
            </div>
            <p className="text-2xl font-bold">{e.scoringMode === "POINTS" ? e.pointsPerPlayerPerMatch : e.setsPerMatch}</p>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-sm">Игроков</span>
            </div>
            <p className="text-2xl font-bold">
              {registered.length}
              <span className="text-base font-normal text-muted-foreground">/{e.courtsCount * 4}</span>
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
          <div className="p-6 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Участники</h2>
                  <p className="text-sm text-muted-foreground">Для старта нужно минимум {e.courtsCount * 4} игроков</p>
                </div>
              </div>
              <span
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md",
                  registered.length >= e.courtsCount * 4 ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground",
                )}
              >
                {registered.length} из {e.courtsCount * 4}
              </span>
            </div>
            <div className="mt-4">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {registered.map((p, idx) => (
                <PlayerTooltip
                  key={p.id}
                  player={{
                    id: p.id,
                    name: p.name,
                    rating: p.rating,
                    matches: p.gamesPlayed,
                  }}
                  showAddFriend={false}
                >
                  <button className="group relative p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10">
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </div>
                    <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-2">
                      {p.name?.[0]?.toUpperCase?.() ?? "?"}
                    </div>
                    <p className="text-sm font-medium text-center truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground text-center">{p.rating}</p>
                  </button>
                </PlayerTooltip>
              ))}

              {Array.from({ length: Math.max(0, e.courtsCount * 4 - registered.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="p-4 rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer group"
                  role="button"
                  tabIndex={0}
                  onClick={() => setInviteOpen(true)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") setInviteOpen(true);
                  }}
                >
                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-2 group-hover:border-primary/50">
                    <UserPlus className="h-4 w-4 opacity-50" />
                  </div>
                  <p className="text-xs">Свободно</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {data.rounds.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold">Раунд {r.roundNumber}</div>
                <div className="text-sm text-muted-foreground">Матчей: {r.matches.length}</div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-sm uppercase tracking-wider text-muted-foreground">
                      <th className="pb-3 pr-6 font-medium">Корт</th>
                      <th className="pb-3 pr-6 font-medium">Матч</th>
                      <th className="pb-3 pr-6 font-medium">Счёт</th>
                      <th className="pb-3 font-medium">Статус</th>
                      <th className="pb-3 pl-6 font-medium text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.matches.map((m) => (
                      <tr key={m.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-3 pr-6">{m.courtNumber}</td>
                        <td className="py-3 pr-6 text-muted-foreground">{matchTitle(m)}</td>
                        <td className="py-3 pr-6">{scoreText(e.scoringMode, m)}</td>
                        <td className="py-3 text-muted-foreground">{m.status}</td>
                        <td className="py-3 pl-6 text-right">
                          {e.status === "IN_PROGRESS" && isAuthor ? (
                            e.scoringMode === "POINTS" ? (
                              <Button size="sm" variant="secondary" onClick={() => openScoreDialog(m)}>
                                Ввести счёт
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Сеты пока не поддержаны</span>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <Dialog
          open={scoreOpen}
          onOpenChange={(open) => {
            setScoreOpen(open);
            if (!open) {
              setScoreMatch(null);
              setScoreError(null);
              setScoreSaving(false);
              setScoreAutoFilled(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ввести счёт</DialogTitle>
            </DialogHeader>

            {!scoreMatch ? (
              <div className="text-sm text-muted-foreground">Выберите матч</div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">{matchTitle(scoreMatch)}</div>

                {(() => {
                  const maxScore = (data?.event.pointsPerPlayerPerMatch ?? 6) * 4;
                  return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Команда A</Label>
                    <Select
                      value={scoreA}
                      onValueChange={(val) => {
                        setScoreA(val);
                        if (!scoreAutoFilled) {
                          const n = Number(val);
                          if (Number.isFinite(n)) {
                            setScoreB(String(Math.max(0, maxScore - n)));
                            setScoreAutoFilled(true);
                          }
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="0" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: (data?.event.pointsPerPlayerPerMatch ?? 6) * 4 + 1 }, (_, i) => (
                          <SelectItem key={`a-${i}`} value={String(i)}>
                            {i}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Команда B</Label>
                    <Select
                      value={scoreB}
                      onValueChange={(val) => {
                        setScoreB(val);
                        if (!scoreAutoFilled) {
                          const n = Number(val);
                          if (Number.isFinite(n)) {
                            setScoreA(String(Math.max(0, maxScore - n)));
                            setScoreAutoFilled(true);
                          }
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="0" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: (data?.event.pointsPerPlayerPerMatch ?? 6) * 4 + 1 }, (_, i) => (
                          <SelectItem key={`b-${i}`} value={String(i)}>
                            {i}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                  );
                })()}

                {scoreError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{scoreError}</div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" className="bg-transparent" onClick={() => setScoreOpen(false)} disabled={scoreSaving}>
                    Отмена
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!eventId || !scoreMatch) return;
                      const a = Number(scoreA);
                      const b = Number(scoreB);
                      if (!Number.isFinite(a) || !Number.isFinite(b)) {
                        setScoreError("Введите числа для обеих команд");
                        return;
                      }
                      setScoreSaving(true);
                      setScoreError(null);
                      try {
                        await api.submitScore(scoreMatch.id, { teamAPoints: a, teamBPoints: b });
                        const refreshed = await api.getEventDetails(eventId);
                        setData(refreshed);
                        setInfo("Счёт сохранён");
                        setScoreOpen(false);
                      } catch (e: any) {
                        setScoreError(e?.message ?? "Не удалось сохранить счёт");
                      } finally {
                        setScoreSaving(false);
                      }
                    }}
                    disabled={scoreSaving}
                  >
                    {scoreSaving ? "Сохраняем…" : "Сохранить"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* info/actionError are now shown near the actions */}
      </div>
    );
  }, [
    actionError,
    canceling,
    closing,
    data,
    friends,
    friendsError,
    info,
    inviteOpen,
    invitingId,
    invited,
    loadError,
    loading,
    registering,
    scoreA,
    scoreAutoFilled,
    scoreB,
    scoreError,
    scoreMatch,
    scoreOpen,
    scoreSaving,
    finishing,
    starting,
    eventId,
    props.me,
    props.meLoaded,
  ]);

  return <>{content}</>;
}

