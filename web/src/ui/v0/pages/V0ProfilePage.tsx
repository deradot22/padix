import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, EventHistoryItem, EventHistoryMatch, EventInviteItem, FriendsSnapshot, hasToken } from "../../../lib/api";
import { ntrpLevel } from "../../../lib/rating";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalScrollArea } from "@/components/ui/modal-scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerTooltip } from "@/components/player-tooltip";
import { RatingGraph } from "@/components/rating-graph";
import {
  Calendar,
  CheckCircle,
  Clock,
  Gamepad2,
  Hash,
  Mail,
  MapPin,
  Pencil,
  Upload,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  UserPlus,
  Users,
  Users2,
  X,
  XCircle,
  ChevronDown,
} from "lucide-react";

function formatPublicId(publicId?: string | null) {
  if (!publicId) return null;
  const trimmed = publicId.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function isPastDate(dateStr: string) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  return dateStr < todayIso;
}

export function V0ProfilePage(props: { me: any; meLoaded?: boolean; onMeUpdate?: (me: any) => void }) {
  const nav = useNavigate();
  const [meLive, setMeLive] = useState<any | null>(null);
  const [friends, setFriends] = useState<FriendsSnapshot | null>(null);
  const [friendInput, setFriendInput] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [invites, setInvites] = useState<EventInviteItem[] | null>(null);
  const [inviteEventJoined, setInviteEventJoined] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<EventHistoryItem[] | null>(null);
  const [details, setDetails] = useState<EventHistoryMatch[] | null>(null);
  const [detailsTitle, setDetailsTitle] = useState<string | null>(null);
  const [detailsEventId, setDetailsEventId] = useState<string | null>(null);
  const [detailsStatsOpen, setDetailsStatsOpen] = useState(false);
  const [detailsStats, setDetailsStats] = useState<{ id: string; name: string; points: number; avatarUrl?: string | null }[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [acceptedInvites, setAcceptedInvites] = useState<Record<string, boolean>>({});
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [friendsExpanded, setFriendsExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [ratingHistory, setRatingHistory] = useState<{ date: string; rating: number; delta: number | null }[]>([]);
  const [graphOpen, setGraphOpen] = useState(false);
  const [editGameOpen, setEditGameOpen] = useState(false);
  const [editGameEventId, setEditGameEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);

  useEffect(() => {
    if (!idCopied) return;
    const id = window.setTimeout(() => setIdCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [idCopied]);

  useEffect(() => {
    if (!info) return;
    const id = window.setTimeout(() => setInfo(null), 5000);
    return () => window.clearTimeout(id);
  }, [info]);

  useEffect(() => {
    if (!props.me) return;
    api
      .me()
      .then((m) => {
        setMeLive(m);
        setAvatar(m.avatarUrl ?? null);
      })
      .catch(() => setMeLive(null));
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

  useEffect(() => {
    if (!props.me?.playerId) return;
    const items = invites ?? [];
    if (items.length === 0) {
      setInviteEventJoined(new Set());
      return;
    }
    let cancelled = false;
    Promise.all(items.map((inv) => api.getEventDetails(inv.eventId)))
      .then((details) => {
        if (cancelled) return;
        const joined = new Set<string>();
        details.forEach((d) => {
          const meId = props.me?.playerId;
          const hasMe =
            !!meId &&
            (d.registeredPlayers ?? []).some((p) => p.id === meId);
          if (hasMe) joined.add(d.event.id);
        });
        setInviteEventJoined(joined);
      })
      .catch(() => {
        if (!cancelled) setInviteEventJoined(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [invites, props.me?.playerId]);

  useEffect(() => {
    if (!props.me) return;
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
    if (!props.me?.playerId || !hasToken()) return;
    let cancelled = false;
    api
      .getRatingHistory()
      .then((h) => { if (!cancelled) setRatingHistory(h); })
      .catch(() => { if (!cancelled) setRatingHistory([]); });
    return () => { cancelled = true; };
  }, [props.me?.playerId]);

  const historyContent = useMemo(() => {
    if (historyLoading) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
    if (historyError)
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Не удалось загрузить: {historyError}
        </div>
      );
    if (!history?.length) return <div className="text-sm text-muted-foreground">История пуста — сыграй первый матч.</div>;

    const items = history.slice(0, 5);
    return (
      <div className="min-w-0 overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "90px" }} />
            <col style={{ width: "70%" }} />
            <col style={{ width: "110px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 pr-2 text-left font-semibold">Дата</th>
              <th className="pb-3 px-2 text-left font-semibold">Событие</th>
              <th className="pb-3 pl-2 text-center font-semibold">Рейтинг</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((it) => (
              <tr
                key={it.eventId}
                className="group transition-colors hover:bg-secondary/30 cursor-pointer"
                onClick={async () => {
                  try {
                    const res = await api.myHistoryEvent(it.eventId);
                    setDetails(res);
                    setDetailsEventId(it.eventId);
                    setDetailsStatsOpen(false);
                    setDetailsStats([]);
                    setDetailsTitle(it.eventTitle);
                  } catch (err: any) {
                    setHistoryError(err?.message ?? "Ошибка");
                  }
                }}
              >
                <td className="py-4 pr-2 text-sm text-muted-foreground font-medium overflow-hidden align-middle">
                  <div>{it.eventDate}</div>
                  {it.eventStartTime ? (
                    <div className="text-xs">
                      {it.eventStartTime.slice(0, 5)}
                      {it.eventEndTime ? `–${it.eventEndTime.slice(0, 5)}` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="py-4 px-2 overflow-hidden align-middle">
                  <div className="font-semibold truncate" title={it.eventTitle}>{it.eventTitle}</div>
                  {it.participants?.length ? (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate" title={it.participants.join(", ")}>
                      {it.participants.join(", ")}
                    </div>
                  ) : null}
                </td>
                <td className="py-4 pl-2 align-middle">
                  <div className="flex flex-col items-center justify-center gap-1">
                    {(it.ratingDelta ?? 0) !== 0 ? (
                      (it.ratingDelta ?? 0) >= 0 ? (
                        <Badge className="gap-1.5 w-fit bg-primary/20 text-primary border-primary/30 border">
                          <TrendingUp className="h-3.5 w-3.5" />
                          +{it.ratingDelta}
                        </Badge>
                      ) : (
                        <Badge className="gap-1.5 w-fit bg-destructive/20 text-destructive border-destructive/30 border">
                          <TrendingDown className="h-3.5 w-3.5" />
                          {it.ratingDelta}
                        </Badge>
                      )
                    ) : null}
                    <span className="text-sm tabular-nums font-semibold">
                      {it.totalPoints ?? "—"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [history, historyError, historyLoading]);

  if (!props.me) {
    if (!props.meLoaded) {
      return <div className="text-sm text-muted-foreground">Загрузка…</div>;
    }
    return (
      <div className="space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">Профиль</h1>
        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="text-lg font-semibold">Нужно войти</div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => nav("/login")}>Войти</Button>
              <Button variant="outline" onClick={() => nav("/register")}>
                Регистрация
              </Button>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">Профиль доступен после авторизации.</div>
          </CardContent>
        </Card>
      </div>
    );
  }
  const viewMe = meLive ?? props.me;
  const calibrationMatchesLeft = viewMe.calibrationMatchesRemaining ?? 0;
  const calibration = calibrationMatchesLeft > 0;
  const calibrationPlayed = Math.max(30 - calibrationMatchesLeft, 0);

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">Профиль</h1>

        <Card className="overflow-hidden border-border/50">
          <div className="h-32 bg-gradient-to-r from-primary/30 via-primary/15 to-accent/10" />
          <CardContent className="-mt-16 pb-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-background bg-gradient-to-br from-primary/20 to-primary/5 shadow-xl overflow-hidden">
                  {avatar ? (
                    <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-12 w-12 text-primary" />
                  )}
                </div>
                <div>
                  <h2 className="text-3xl font-bold">{viewMe.name}</h2>
                  <p className="flex items-center gap-2 text-muted-foreground mt-1">
                    <Mail className="h-4 w-4" />
                    {viewMe.email}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nav("/settings")}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Настройки
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Badge className="h-10 gap-2 px-4 py-0 bg-primary/10 text-primary border border-primary/20 text-base">
                <Trophy className="h-4 w-4" />
                {calibration ? (
                  "на калибровке"
                ) : (
                  <>
                    {viewMe.rating} (NTRP {ntrpLevel(viewMe.rating)})
                  </>
                )}
              </Badge>
              <Badge className="h-10 gap-2 px-4 py-0 bg-accent/10 text-accent border border-accent/20 text-base">
                <Gamepad2 className="h-4 w-4" />
                {viewMe.gamesPlayed} матчей
              </Badge>
              {viewMe.gender ? (
                <Badge variant="secondary" className="h-10 gap-2 px-4 py-0 text-base">
                  {viewMe.gender === "M" ? "М" : "Ж"}
                </Badge>
              ) : null}
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex"
                  onClick={async () => {
                    const pid = formatPublicId(viewMe.publicId);
                    if (!pid) return;
                    try {
                      await navigator.clipboard.writeText(pid);
                      setIdCopied(true);
                    } catch {
                      setInfo(pid);
                    }
                  }}
                  aria-label="Скопировать ID"
                  title="Скопировать ID"
                >
                  <Badge variant="secondary" className="h-10 gap-2 px-4 py-0 text-sm">
                    <span className="text-xs uppercase text-muted-foreground">ID</span>
                    {formatPublicId(viewMe.publicId)}
                  </Badge>
                </button>
                <span
                  className={cn(
                    "pointer-events-none absolute -top-2 right-0 translate-y-[-100%] rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-300 transition-all duration-200",
                    idCopied ? "opacity-100 translate-y-[-110%]" : "opacity-0 translate-y-[-80%]",
                  )}
                >
                  Скопировано
                </span>
              </div>
            </div>

            {calibration ? (
              <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-200">
                    Калибровка: <strong>{calibrationPlayed}/30</strong> матчей сыграно
                  </p>
                </div>
                <div className="h-2 rounded-full bg-amber-900/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${(calibrationPlayed / 30) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}

          </CardContent>
        </Card>

        <div className="grid gap-8 lg:grid-cols-3 items-stretch">
          <Card className="lg:col-span-2 border-border/50 flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-6 w-6 text-primary" />
                Приглашения в игры
              </CardTitle>
              <CardDescription>
                {(invites ?? [])
                  .filter((inv) => !isPastDate(inv.eventDate))
                  .filter((inv) => !inviteEventJoined.has(inv.eventId)).length}{" "}
                новых приглашений
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 flex-1">
              {(invites ?? [])
                .filter((inv) => !isPastDate(inv.eventDate))
                .filter((inv) => !inviteEventJoined.has(inv.eventId)).length === 0 ? (
                <div className="text-sm text-muted-foreground">Пока приглашений нет.</div>
              ) : (
                (invites ?? [])
                  .filter((inv) => !isPastDate(inv.eventDate))
                  .filter((inv) => !inviteEventJoined.has(inv.eventId))
                  .map((invite) => {
                  const key = `${invite.eventId}-${invite.fromPublicId}`;
                  const accepted = acceptedInvites[key];
                  return (
                    <Card key={key} className="overflow-hidden transition-all border-2">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-semibold text-lg">{invite.eventTitle}</h3>
                                <p className="text-sm text-muted-foreground">
                                  Организатор: <strong>{invite.fromName}</strong>
                                </p>
                              </div>
                              {accepted ? (
                                <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 border">
                                  <CheckCircle className="h-3 w-3" />
                                  Принято
                                </Badge>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-3 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="h-4 w-4 text-primary" />
                                {invite.eventDate}
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Users2 className="h-4 w-4 text-primary" />
                                {invite.fromPublicId}
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4 text-primary" />
                                —
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 sm:flex-col">
                            <Button
                              onClick={async () => {
                                setInviteActionId(key);
                                try {
                                  await api.acceptEventInvite(invite.eventId);
                                  setAcceptedInvites((m) => ({ ...m, [key]: true }));
                                  const refreshed = await api.getInvites();
                                  setInvites(refreshed ?? []);
                                } catch (e: any) {
                                  setHistoryError(e?.message ?? "Ошибка");
                                } finally {
                                  setInviteActionId(null);
                                }
                              }}
                              disabled={inviteActionId === key}
                              className={
                                accepted
                                  ? "gap-2 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
                                  : "gap-2 bg-primary text-primary-foreground"
                              }
                            >
                              <CheckCircle className="h-4 w-4" />
                              <span>{accepted ? "Принято" : "Принять"}</span>
                            </Button>
                            <Button
                              variant="outline"
                              disabled={inviteActionId === key}
                              onClick={async () => {
                                setInviteActionId(key);
                                try {
                                  await api.declineEventInvite(invite.eventId);
                                  const refreshed = await api.getInvites();
                                  setInvites(refreshed ?? []);
                                } catch (e: any) {
                                  setHistoryError(e?.message ?? "Ошибка");
                                } finally {
                                  setInviteActionId(null);
                                }
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" onClick={() => nav(`/events/${invite.eventId}`)}>
                              Открыть
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 flex flex-col">
            <CardHeader
              className="pb-4 cursor-pointer select-none"
              onClick={() => setFriendsExpanded((v) => !v)}
              role="button"
              aria-expanded={friendsExpanded}
            >
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Друзья
                  {(friends?.friends ?? []).length > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({(friends?.friends ?? []).length})
                    </span>
                  )}
                </CardTitle>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !friendsExpanded && "-rotate-90")} />
              </div>
              <CardDescription>Добавьте друзей по их ID</CardDescription>
            </CardHeader>
            <CardContent className={cn("space-y-4 flex-1", !friendsExpanded && "hidden")}>
              <div className="flex gap-2">
                <Input
                  placeholder="#123456789"
                  value={friendInput}
                  onChange={(e) => setFriendInput(e.target.value)}
                  className="bg-secondary border-border h-10"
                />
                <Button
                  className="px-4"
                  size="icon"
                  disabled={friendLoading || friendInput.trim().length === 0}
                  onClick={async () => {
                    setFriendLoading(true);
                    setFriendError(null);
                    try {
                      await api.requestFriend(friendInput);
                      setFriendInput("");
                      const updated = await api.getFriends();
                      setFriends(updated);
                      setInfo("Заявка отправлена");
                    } catch (err: any) {
                      const msg = err?.message ?? "Ошибка отправки";
                      if (typeof msg === "string" && msg.toLowerCase().includes("already")) {
                        setFriendError("Заявка уже отправлена");
                      } else {
                        setFriendError(msg);
                      }
                    } finally {
                      setFriendLoading(false);
                    }
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>

              {friendError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{friendError}</div>
              ) : null}
              {info ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {info}
                </div>
              ) : null}

              {(friends?.friends ?? []).length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Ваши друзья</p>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {(friends?.friends ?? []).map((friend) => (
                    <PlayerTooltip
                      key={friend.userId}
                      player={{
                        id: friend.userId,
                        name: friend.name,
                        rating: friend.rating,
                        matches: friend.gamesPlayed,
                        ntrp: friend.ntrp,
                        odid: friend.publicId,
                        avatarUrl: friend.avatarUrl,
                      }}
                      showAddFriend={false}
                    >
                      <div className="flex items-center gap-3 rounded-lg bg-secondary/50 p-2 px-3 cursor-pointer hover:bg-secondary transition-colors">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-sm font-semibold">
                          {friend.avatarUrl ? (
                            <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            friend.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{friend.name}</p>
                          <p className="text-xs text-muted-foreground">{friend.rating} • {friend.ntrp ?? ntrpLevel(friend.rating)}</p>
                        </div>
                      </div>
                    </PlayerTooltip>
                  ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Пока нет друзей.</div>
              )}

              {(friends?.incoming ?? []).length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Входящие заявки</p>
                  {(friends?.incoming ?? []).map((r) => (
                    <div key={r.publicId} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 p-2 px-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-sm font-semibold">
                          {r.avatarUrl ? (
                            <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            r.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{r.name}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            await api.acceptFriend(r.publicId);
                            const updated = await api.getFriends();
                            setFriends(updated);
                          }}
                        >
                          Принять
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await api.declineFriend(r.publicId);
                            const updated = await api.getFriends();
                            setFriends(updated);
                          }}
                        >
                          Отклонить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {ratingHistory.length > 1 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <Button variant="ghost" className="w-full justify-between" onClick={() => setGraphOpen((o) => !o)}>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  График рейтинга
                </CardTitle>
                <span className="text-muted-foreground">{graphOpen ? "−" : "+"}</span>
              </Button>
            </CardHeader>
            {graphOpen && (
              <CardContent>
                <RatingGraph points={ratingHistory} />
              </CardContent>
            )}
          </Card>
        )}

        <Card className="border-border/50">
          <CardHeader
            className="pb-4 cursor-pointer select-none"
            onClick={() => setHistoryExpanded((v) => !v)}
            role="button"
            aria-expanded={historyExpanded}
          >
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                История матчей
              </CardTitle>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !historyExpanded && "-rotate-90")} />
            </div>
            <CardDescription>История ваших игр и изменение рейтинга</CardDescription>
          </CardHeader>
          <CardContent className={cn(!historyExpanded && "hidden")}>{historyContent}</CardContent>
        </Card>

        {details ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => { setDetails(null); setDetailsStatsOpen(false); }}>
            <ModalScrollArea className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{detailsTitle}</div>
                  {details?.[0]?.eventStartTime ? (
                    <div className="text-sm text-muted-foreground">
                      {details[0].eventStartTime.slice(0, 5)}
                      {details[0].eventEndTime ? `–${details[0].eventEndTime.slice(0, 5)}` : ""}
                    </div>
                  ) : null}
                  {details?.[0]?.eventDate ? (
                    <div className="text-sm text-muted-foreground">{details[0].eventDate}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditGameEventId(detailsEventId);
                      setEditGameOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Редактировать счет
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setDetails(null); setDetailsStatsOpen(false); }}>
                    Закрыть
                  </Button>
                </div>
              </div>
              <Button
                variant="secondary"
                className="w-full mt-3"
                onClick={async () => {
                  if (detailsStatsOpen) {
                    setDetailsStatsOpen(false);
                    return;
                  }
                  if (detailsStats.length > 0) {
                    setDetailsStatsOpen(true);
                    return;
                  }
                  if (!detailsEventId) return;
                  try {
                    const d = await api.getEventDetails(detailsEventId);
                    const totals = new Map<string, { id: string; name: string; points: number; avatarUrl?: string | null }>();
                    d.rounds.flatMap((r: any) => r.matches).forEach((m: any) => {
                      const score = m.score;
                      if (!score || score.mode !== "POINTS") return;
                      const ptsA = score.points?.teamAPoints ?? 0;
                      const ptsB = score.points?.teamBPoints ?? 0;
                      m.teamA.forEach((p: any) => {
                        if (!p?.id) return;
                        const row = totals.get(p.id) ?? { id: p.id, name: p.name, points: 0, avatarUrl: p.avatarUrl };
                        row.points += ptsA;
                        totals.set(p.id, row);
                      });
                      m.teamB.forEach((p: any) => {
                        if (!p?.id) return;
                        const row = totals.get(p.id) ?? { id: p.id, name: p.name, points: 0, avatarUrl: p.avatarUrl };
                        row.points += ptsB;
                        totals.set(p.id, row);
                      });
                    });
                    const rows = Array.from(totals.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
                    setDetailsStats(rows);
                    setDetailsStatsOpen(true);
                  } catch {}
                }}
              >
                <Trophy className="h-4 w-4 mr-1.5" />
                Статистика
              </Button>

              {detailsStatsOpen && detailsStats.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {detailsStats.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-6 w-6 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-[10px] font-semibold">
                          {row.avatarUrl ? (
                            <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            row.name?.[0]?.toUpperCase() ?? "?"
                          )}
                        </div>
                        <span className="text-sm font-medium truncate">{row.name}</span>
                      </div>
                      <div className="text-sm font-semibold shrink-0 ml-2">{row.points}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-sm uppercase tracking-wider text-muted-foreground">
                      <th className="pb-3 pr-4 font-medium">Раунд</th>
                      <th className="pb-3 pr-4 font-medium">Корт</th>
                      <th className="pb-3 pr-4 font-medium">Пара</th>
                      <th className="pb-3 pr-4 font-medium">Соперники</th>
                      <th className="pb-3 pr-4 font-medium">Счёт</th>
                      <th className="pb-3 pr-4 font-medium">Исход</th>
                      <th className="pb-3 font-medium">Рейтинг</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {details.map((it) => (
                      <tr key={it.matchId} className={cn(
                        "transition-colors",
                        it.ratingDelta == null
                          ? "hover:bg-secondary/30"
                          : it.ratingDelta >= 0
                            ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                            : "bg-red-400/5 hover:bg-red-400/10",
                      )}>
                        <td className="py-3 pr-4">{it.roundNumber}</td>
                        <td className="py-3 pr-4">{it.courtNumber}</td>
                        <td className="py-3 pr-4">{it.teamText}</td>
                        <td className="py-3 pr-4">{it.opponentText}</td>
                        <td className="py-3 pr-4">{it.score ?? "—"}</td>
                        <td className="py-3 pr-4">
                          <span className="text-muted-foreground">{it.result}</span>
                        </td>
                        <td className="py-3">
                          {it.ratingDelta == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : it.ratingDelta >= 0 ? (
                            <Badge className="gap-1.5 bg-primary/20 text-primary border-primary/30 border">
                              <TrendingUp className="h-3.5 w-3.5" />
                              +{it.ratingDelta}
                            </Badge>
                          ) : (
                            <Badge className="gap-1.5 bg-destructive/20 text-destructive border-destructive/30 border">
                              <TrendingDown className="h-3.5 w-3.5" />
                              {it.ratingDelta}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 sm:hidden space-y-2.5">
                {details.map((it) => {
                  const scoreParts = it.score?.split(/\s+/) ?? [];
                  const myScoreStr = scoreParts.map((s) => {
                    const [a, b] = s.split(":");
                    return it.isTeamA ? s : `${b}:${a}`;
                  }).join(" ");
                  return (
                    <div key={it.matchId} className={cn(
                      "rounded-lg border px-3 py-2.5 space-y-1.5",
                      it.ratingDelta == null
                        ? "border-border/60 bg-secondary/20"
                        : it.ratingDelta >= 0
                          ? "border-emerald-500/25 bg-emerald-500/10"
                          : "border-red-400/25 bg-red-400/10",
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>R{it.roundNumber}</span>
                        </div>
                        {it.ratingDelta == null ? null : it.ratingDelta >= 0 ? (
                          <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 border text-[11px] py-0 px-1.5">
                            <TrendingUp className="h-2.5 w-2.5" />
                            +{it.ratingDelta}
                          </Badge>
                        ) : (
                          <Badge className="gap-1 bg-destructive/20 text-destructive border-destructive/30 border text-[11px] py-0 px-1.5">
                            <TrendingDown className="h-2.5 w-2.5" />
                            {it.ratingDelta}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 text-left space-y-1">
                          {(it.teamPlayers ?? it.teamText.split(" + ").map((n) => ({ name: n, avatarUrl: null as string | null }))).map((p, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <div className="h-5 w-5 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-[9px] font-semibold">
                                {p.avatarUrl ? (
                                  <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  p.name?.[0]?.toUpperCase() ?? "?"
                                )}
                              </div>
                              <span className="text-xs font-medium truncate">{p.name}</span>
                            </div>
                          ))}
                        </div>
                        <div className="shrink-0 text-center tabular-nums font-bold text-sm px-1">
                          {it.score ? myScoreStr : "—"}
                        </div>
                        <div className="min-w-0 flex-1 text-right space-y-1">
                          {(it.opponentPlayers ?? it.opponentText.split(" + ").map((n) => ({ name: n, avatarUrl: null as string | null }))).map((p, i) => (
                            <div key={i} className="flex items-center gap-1.5 justify-end">
                              <span className="text-xs text-muted-foreground truncate">{p.name}</span>
                              <div className="h-5 w-5 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-[9px] font-semibold">
                                {p.avatarUrl ? (
                                  <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  p.name?.[0]?.toUpperCase() ?? "?"
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ModalScrollArea>
          </div>
        ) : null}

        {editGameOpen && editGameEventId ? (
          <EditGameScoresDialog
            eventId={editGameEventId}
            onClose={() => {
              setEditGameOpen(false);
              setEditGameEventId(null);
            }}
            onSave={async () => {
              setEditGameOpen(false);
              setEditGameEventId(null);
              if (detailsEventId === editGameEventId) {
                try {
                  const updated = await api.myHistory();
                  setHistory(updated);
                } catch {}
              }
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function EditGameScoresDialog(props: {
  eventId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [eventData, setEventData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { teamAPoints: number; teamBPoints: number }>>({});
  const originalScoresRef = useRef<Record<string, { teamAPoints: number; teamBPoints: number }>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getEventDetails(props.eventId);
        setEventData(data);
        const initialScores: Record<string, { teamAPoints: number; teamBPoints: number }> = {};
        data.rounds.flatMap((r: any) => r.matches).forEach((m: any) => {
          const score = m.score?.points;
          initialScores[m.id] = {
            teamAPoints: score?.teamAPoints ?? 0,
            teamBPoints: score?.teamBPoints ?? 0,
          };
        });
        setScores(initialScores);
        originalScoresRef.current = initialScores;
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки события");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [props.eventId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const matches = eventData.rounds.flatMap((r: any) => r.matches);
      for (const match of matches) {
        const newScore = scores[match.id];
        const originalScore = originalScoresRef.current[match.id];

        // Only submit if scores changed
        if (newScore && (newScore.teamAPoints !== originalScore?.teamAPoints || newScore.teamBPoints !== originalScore?.teamBPoints)) {
          await api.saveDraftScore(match.id, newScore);
          await api.submitScore(match.id, newScore);
        }
      }
      props.onSave();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка сохранения счёта");
    } finally {
      setSaving(false);
    }
  };

  if (!eventData && !loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={props.onClose}>
        <div className="bg-card border border-border rounded-lg p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="text-red-500">Ошибка загрузки события</div>
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={props.onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    );
  }

  const matches = eventData?.rounds.flatMap((r: any) => r.matches) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={props.onClose}>
      <ModalScrollArea
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="text-lg font-semibold">Редактирование счёта</div>
          <Button variant="outline" size="sm" onClick={props.onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-6 text-muted-foreground">Загрузка...</div>
        ) : (
          <>
            <div className="space-y-4">
              {matches.map((match: any) => (
                <div key={match.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium mb-1">Команда A</div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        {match.teamA?.map((p: any) => p.name).join(" + ")}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-1">Команда B</div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        {match.teamB?.map((p: any) => p.name).join(" + ")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Точки Team A</label>
                      <Input
                        type="number"
                        min="0"
                        value={scores[match.id]?.teamAPoints ?? 0}
                        onChange={(e) =>
                          setScores({
                            ...scores,
                            [match.id]: {
                              ...scores[match.id],
                              teamAPoints: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                        disabled={saving}
                      />
                    </div>
                    <div className="text-xl font-bold mt-5">:</div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Точки Team B</label>
                      <Input
                        type="number"
                        min="0"
                        value={scores[match.id]?.teamBPoints ?? 0}
                        onChange={(e) =>
                          setScores({
                            ...scores,
                            [match.id]: {
                              ...scores[match.id],
                              teamBPoints: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={props.onClose} disabled={saving} className="flex-1">
                Отмена
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </>
        )}
      </ModalScrollArea>
    </div>
  );
}
