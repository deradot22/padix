import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, Clock, MapPin, Share2, Target, UserPlus, Users, Zap } from "lucide-react";
import { api, EventDetails, FriendItem, FriendsSnapshot, Match } from "../../../lib/api";
import { PlayerTooltip } from "@/components/player-tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatEventDate, timeRange } from "../utils";

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
  const [startPromptOpen, setStartPromptOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<"A" | "B">("A");
  const [scoreByMatch, setScoreByMatch] = useState<Record<string, { a: number; b: number }>>({});
  const [autoFilledByMatch, setAutoFilledByMatch] = useState<Record<string, boolean>>({});
  const [scoreSavingId, setScoreSavingId] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scorePadOpen, setScorePadOpen] = useState(false);

  useEffect(() => {
    if (!props.me) return;
    if (friends) return;
    setFriendsError(null);
    api
      .getFriends()
      .then(setFriends)
      .catch((e: any) => setFriendsError(e?.message ?? "Ошибка загрузки друзей"));
  }, [props.me, friends]);

  useEffect(() => {
    if (!inviteOpen) return;
    if (!props.me) return;
    if (friends) return;
    setFriendsError(null);
    api
      .getFriends()
      .then(setFriends)
      .catch((e: any) => setFriendsError(e?.message ?? "Ошибка загрузки друзей"));
  }, [inviteOpen, props.me, friends]);


  useEffect(() => {
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
    if (!data) return;
    const rounds = data.rounds ?? [];
    if (rounds.length > 0) {
      const fallbackRoundId = rounds[0].id;
      const nextExpandedId = expandedRoundId && rounds.some((r) => r.id === expandedRoundId) ? expandedRoundId : fallbackRoundId;
      if (nextExpandedId !== expandedRoundId) {
        setExpandedRoundId(nextExpandedId);
      }
      const activeRound = rounds.find((r) => r.id === nextExpandedId) ?? rounds[0];
      if (activeRound?.matches?.length) {
        const stillInRound = activeMatchId && activeRound.matches.some((m) => m.id === activeMatchId);
        if (!stillInRound) {
          setActiveMatchId(activeRound.matches[0].id);
        }
      }
    }
    setScoreByMatch((prev) => {
      const next = { ...prev };
      rounds.flatMap((r) => r.matches).forEach((m) => {
        if (next[m.id]) return;
        const points = m.score?.points;
        next[m.id] = {
          a: points?.teamAPoints ?? 0,
          b: points?.teamBPoints ?? 0,
        };
      });
      return next;
    });
  }, [data, expandedRoundId, activeMatchId]);

  const content = useMemo(() => {
    if (!props.me) {
      if (loading) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
      if (loadError)
        return (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            Не удалось загрузить: {loadError}
          </div>
        );
      if (!data) return <div className="text-sm text-muted-foreground">Событие не найдено.</div>;
      const e = data.event;
      return (
        <div className="space-y-6 pb-8">
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

                <div className="text-sm text-muted-foreground">
                  Войдите, чтобы участвовать и вводить счёт.
                </div>
              </div>
            </div>
          </div>
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
    const myPublicId = props.me?.publicId;
    const isRegistered = !!meId && registered.some((p) => p.id === meId);
    const isAuthor = data.isAuthor;
    const progressPercent = Math.min(100, (registered.length / Math.max(1, e.courtsCount * 4)) * 100);
    const friendPublicIds = new Set((friends?.friends ?? []).map((f) => f.publicId));
    const outgoingPublicIds = new Set((friends?.outgoing ?? []).map((f) => f.publicId));

    return (
      <div className="space-y-8 pb-8">
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

              <div className="flex flex-col gap-3 items-start">
                {e.status === "OPEN_FOR_REGISTRATION" || e.status === "REGISTRATION_CLOSED" ? (
                  <>
                    {isRegistered ? (
                      <button
                        type="button"
                        className="h-12 w-full px-6 rounded-md border border-primary bg-primary/10 text-primary text-base font-medium hover:bg-primary/20 transition-colors inline-flex items-center justify-center"
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
                        className="h-12 w-full px-6 rounded-md bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors"
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

                    <div className="flex flex-wrap items-center gap-2 w-full">
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
                            setStartPromptOpen(true);
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
                          onClick={() => setStartPromptOpen(true)}
                        >
                          {starting ? "Стартуем…" : "Начать игру"}
                        </button>
                      ) : null}

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
                        onClick={() => setRoundsOpen(true)}
                      >
                        Ввести счёт
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

                <div className="flex items-center gap-3 self-start">
                  <button
                    type="button"
                    className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                    title="Пригласить"
                    aria-label="Пригласить"
                    onClick={() => setInviteOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
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

        <Dialog open={startPromptOpen} onOpenChange={setStartPromptOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Готовы начать?</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground">
              Игра <b>{data.event.title}</b> готова к началу. Все участники зарегистрированы.
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
              <Button variant="outline" className="bg-transparent" onClick={() => setStartPromptOpen(false)}>
                Позже
              </Button>
              <Button
                onClick={async () => {
                  if (!eventId) return;
                  setStarting(true);
                  setActionError(null);
                  setInfo(null);
                  try {
                    await api.startEvent(eventId);
                    const refreshed = await api.getEventDetails(eventId);
                    setData(refreshed);
                    setStartPromptOpen(false);
                    setRoundsOpen(true);
                  } catch (err: any) {
                    setActionError(err?.message ?? "Ошибка старта");
                  } finally {
                    setStarting(false);
                  }
                }}
                disabled={starting}
              >
                {starting ? "Стартуем…" : "Начать игру"}
              </Button>
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
                    odid: p.publicId,
                  }}
                  showAddFriend={p.id !== meId}
                  addFriendStatus={
                    !p.publicId
                      ? "none"
                      : friendPublicIds.has(p.publicId)
                        ? "friend"
                        : outgoingPublicIds.has(p.publicId)
                          ? "requested"
                          : "none"
                  }
                  onAddFriend={async () => {
                    if (!p.publicId) {
                      throw new Error("Не удалось определить публичный ID");
                    }
                    await api.requestFriend(p.publicId);
                    setFriends((prev) =>
                      prev
                        ? {
                            ...prev,
                            outgoing: prev.outgoing.some((o) => o.publicId === p.publicId)
                              ? prev.outgoing
                              : [...prev.outgoing, { publicId: p.publicId, name: p.name }],
                          }
                        : prev,
                    );
                    return "Заявка отправлена";
                  }}
                >
                  <button className="group relative w-full p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10">
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

        <Dialog
          open={roundsOpen}
          onOpenChange={(open) => {
            setRoundsOpen(open);
            if (!open) {
              setScorePadOpen(false);
            }
          }}
        >
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Раунды</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {(data.rounds ?? []).map((r) => {
                const expanded = r.id === expandedRoundId;
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 p-4 text-left"
                      onClick={() => {
                        setExpandedRoundId(r.id);
                        setScorePadOpen(false);
                      }}
                    >
                      <div>
                        <div className="text-lg font-semibold">Раунд {r.roundNumber}</div>
                        <div className="text-sm text-muted-foreground">Матчей: {r.matches.length}</div>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 transition-transform", expanded ? "rotate-180" : "")} />
                    </button>

                    {expanded ? (
                      <div className="px-4 pb-4">
                        <div className="space-y-3">
                          {r.matches.map((m) => {
                            const scores = scoreByMatch[m.id] ?? { a: 0, b: 0 };
                            const active = m.id === activeMatchId;
                            const teamA = m.teamA.map((p) => p.name).join(" + ");
                            const teamB = m.teamB.map((p) => p.name).join(" + ");
                            return (
                              <div
                                key={m.id}
                                className={cn(
                                  "rounded-lg border border-border/50 p-3 transition-colors",
                                  active ? "bg-secondary/30" : "bg-secondary/10",
                                )}
                              >
                                <div className="text-sm text-muted-foreground">{m.courtName ?? `Корт ${m.courtNumber}`}</div>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded-lg border px-3 py-3 text-center transition-colors",
                                      activeTeam === "A" && active ? "border-primary text-primary" : "border-border",
                                    )}
                                    onClick={() => {
                                      setActiveMatchId(m.id);
                                      setActiveTeam("A");
                                      setScorePadOpen(true);
                                    }}
                                  >
                                    <div className="text-xs text-muted-foreground">{teamA}</div>
                                    <div className="mt-1 text-2xl font-semibold">{scores.a}</div>
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded-lg border px-3 py-3 text-center transition-colors",
                                      activeTeam === "B" && active ? "border-primary text-primary" : "border-border",
                                    )}
                                    onClick={() => {
                                      setActiveMatchId(m.id);
                                      setActiveTeam("B");
                                      setScorePadOpen(true);
                                    }}
                                  >
                                    <div className="text-xs text-muted-foreground">{teamB}</div>
                                    <div className="mt-1 text-2xl font-semibold">{scores.b}</div>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {activeMatchId && scorePadOpen ? (
                          <div className="mt-4">
                            <div className="grid grid-cols-6 gap-2">
                              {Array.from({ length: (e.pointsPerPlayerPerMatch ?? 6) * 4 }, (_, i) => i + 1).map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  className="rounded-lg border border-border bg-secondary/20 py-2 text-sm font-semibold hover:bg-secondary"
                                  onClick={() => {
                                    const totalPoints = (e.pointsPerPlayerPerMatch ?? 6) * 4;
                                    setScoreByMatch((prev) => {
                                      const current = prev[activeMatchId] ?? { a: 0, b: 0 };
                                      let nextA = activeTeam === "A" ? n : current.a;
                                      let nextB = activeTeam === "B" ? n : current.b;
                                      const autoFilled = autoFilledByMatch[activeMatchId];
                                      const canAutoFill =
                                        !autoFilled &&
                                        ((activeTeam === "A" && current.b === 0) ||
                                          (activeTeam === "B" && current.a === 0));
                                      if (canAutoFill) {
                                        if (activeTeam === "A") {
                                          nextB = Math.max(0, totalPoints - n);
                                        } else {
                                          nextA = Math.max(0, totalPoints - n);
                                        }
                                        setAutoFilledByMatch((m) => ({ ...m, [activeMatchId]: true }));
                                      }
                                      return {
                                        ...prev,
                                        [activeMatchId]: { a: nextA, b: nextB },
                                      };
                                    });
                                  }}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              {scoreError ? (
                                <div className="text-xs text-destructive">{scoreError}</div>
                              ) : (
                                <div className="text-xs text-muted-foreground">Выберите значение для активной команды</div>
                              )}
                              <Button
                                size="sm"
                                disabled={scoreSavingId === activeMatchId}
                                onClick={async () => {
                                  const current = scoreByMatch[activeMatchId];
                                  if (!current) return;
                                  if (!eventId) return;
                                  setScoreSavingId(activeMatchId);
                                  setScoreError(null);
                                  try {
                                    await api.submitScore(activeMatchId, { teamAPoints: current.a, teamBPoints: current.b });
                                    const refreshed = await api.getEventDetails(eventId);
                                    setData(refreshed);
                                    setInfo("Счёт сохранён");
                                    const rounds = refreshed.rounds ?? [];
                                    const currentIdx = rounds.findIndex((round) =>
                                      round.matches.some((m) => m.id === activeMatchId),
                                    );
                                    const nextRound = currentIdx >= 0 ? rounds[currentIdx + 1] : null;
                                    if (nextRound) {
                                      setExpandedRoundId(nextRound.id);
                                      setActiveMatchId(nextRound.matches[0]?.id ?? null);
                                    }
                                    setScorePadOpen(false);
                                  } catch (e: any) {
                                    const msg = e?.message ?? "Не удалось сохранить счёт";
                                    if (msg.includes("Survey is required")) {
                                      setScoreError("Нужно пройти опрос, чтобы сохранять счёт.");
                                    } else if (msg.includes("Only participants")) {
                                      setScoreError("Сохранять счёт могут только участники игры.");
                                    } else if (msg.includes("Only author")) {
                                      setScoreError("Сохранять счёт может только автор игры.");
                                    } else if (msg.includes("HTTP 403")) {
                                      setScoreError("Нет доступа для сохранения счёта.");
                                    } else if (msg.includes("HTTP 401")) {
                                      setScoreError("Нужна авторизация для сохранения счёта.");
                                    } else {
                                      setScoreError(msg);
                                    }
                                  } finally {
                                    setScoreSavingId(null);
                                  }
                                }}
                              >
                                {scoreSavingId === activeMatchId ? "Сохраняем…" : "Следующий раунд"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground">Нажмите на счёт команды, чтобы выбрать очки.</div>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={
                                !activeMatchId ||
                                !scoreByMatch[activeMatchId] ||
                                (scoreByMatch[activeMatchId].a === 0 && scoreByMatch[activeMatchId].b === 0)
                              }
                              onClick={async () => {
                                if (!activeMatchId || !eventId) return;
                                const current = scoreByMatch[activeMatchId];
                                if (!current) return;
                                if (current.a === 0 && current.b === 0) return;
                                setScoreSavingId(activeMatchId);
                                setScoreError(null);
                                try {
                                  await api.submitScore(activeMatchId, { teamAPoints: current.a, teamBPoints: current.b });
                                  const refreshed = await api.getEventDetails(eventId);
                                  setData(refreshed);
                                  setInfo("Счёт сохранён");
                                  const rounds = refreshed.rounds ?? [];
                                  const currentIdx = rounds.findIndex((round) =>
                                    round.matches.some((m) => m.id === activeMatchId),
                                  );
                                  const nextRound = currentIdx >= 0 ? rounds[currentIdx + 1] : null;
                                  if (nextRound) {
                                    setExpandedRoundId(nextRound.id);
                                    setActiveMatchId(nextRound.matches[0]?.id ?? null);
                                  }
                                } catch (e: any) {
                                  const msg = e?.message ?? "Не удалось сохранить счёт";
                                  if (msg.includes("Survey is required")) {
                                    setScoreError("Нужно пройти опрос, чтобы сохранять счёт.");
                                  } else if (msg.includes("Only participants")) {
                                    setScoreError("Сохранять счёт могут только участники игры.");
                                  } else if (msg.includes("Only author")) {
                                    setScoreError("Сохранять счёт может только автор игры.");
                                  } else if (msg.includes("HTTP 403")) {
                                    setScoreError("Нет доступа для сохранения счёта.");
                                  } else if (msg.includes("HTTP 401")) {
                                    setScoreError("Нужна авторизация для сохранения счёта.");
                                  } else {
                                    setScoreError(msg);
                                  }
                                } finally {
                                  setScoreSavingId(null);
                                }
                              }}
                            >
                              {scoreSavingId === activeMatchId ? "Сохраняем…" : "Следующий раунд"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setInfo("Добавление раунда пока не поддержано.")}>
                  + Раунд
                </Button>
                <Button variant="secondary" onClick={() => setInfo("Финальный раунд пока не поддержан.")}>
                  Финальный раунд
                </Button>
              </div>
              <Button
                variant="destructive"
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
                disabled={finishing}
              >
                {finishing ? "Завершаем…" : "Завершить игру"}
              </Button>
            </div>
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
    roundsOpen,
    expandedRoundId,
    activeMatchId,
    activeTeam,
    scoreByMatch,
    autoFilledByMatch,
    scoreError,
    scoreSavingId,
    scorePadOpen,
    friends,
    friendsError,
    info,
    inviteOpen,
    invitingId,
    invited,
    loadError,
    loading,
    registering,
    finishing,
    starting,
    startPromptOpen,
    eventId,
    props.me,
    props.meLoaded,
  ]);

  return <>{content}</>;
}

