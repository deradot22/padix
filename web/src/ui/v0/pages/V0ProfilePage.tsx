import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, EventHistoryItem, EventHistoryMatch, EventInviteItem, FriendsSnapshot, Round, TopPartner, hasToken } from "../../../lib/api";
import { ntrpLevel } from "../../../lib/rating";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditProfileDialog } from "@/components/edit-profile-dialog";
import { Input } from "@/components/ui/input";
import { EditGameScoresDialog } from "@/components/edit-game-scores-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerTooltip } from "@/components/player-tooltip";
import { EventLeaderboard } from "@/components/event-leaderboard";
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
} from "lucide-react";

const NTRP_BOUNDS: { level: string; lo: number; hi: number }[] = [
  { level: "1.0", lo: 0, hi: 900 },
  { level: "1.5", lo: 900, hi: 1000 },
  { level: "2.0", lo: 1000, hi: 1100 },
  { level: "2.5", lo: 1100, hi: 1200 },
  { level: "3.0", lo: 1200, hi: 1500 },
  { level: "3.5", lo: 1500, hi: 1700 },
  { level: "4.0", lo: 1700, hi: 1900 },
  { level: "4.5", lo: 1900, hi: 2100 },
  { level: "5.0+", lo: 2100, hi: Infinity },
];

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

// Матчи в деталях истории показываем по возрастанию: раунд 1 сверху, внутри раунда — по корту.
function sortMatchesByRound(matches: EventHistoryMatch[]): EventHistoryMatch[] {
  return [...matches].sort((a, b) => (a.roundNumber - b.roundNumber) || (a.courtNumber - b.courtNumber));
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
  const [detailsRounds, setDetailsRounds] = useState<Round[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [acceptedInvites, setAcceptedInvites] = useState<Record<string, boolean>>({});
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [profileTab, setProfileTab] = useState<"graph" | "history" | "friends" | "invites" | "partners">("history");
  const [partners, setPartners] = useState<TopPartner[] | null>(null);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState<string | null>(null);
  const [ratingHistory, setRatingHistory] = useState<{ date: string; rating: number; delta: number | null }[]>([]);
  const [ratingHistoryLoaded, setRatingHistoryLoaded] = useState(false);
  const [invitesDetailsLoaded, setInvitesDetailsLoaded] = useState(false);
  const [editGameOpen, setEditGameOpen] = useState(false);
  const [editGameEventId, setEditGameEventId] = useState<string | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // Блокируем прокрутку фона, пока открыта модалка деталей игры: это кастомный
  // fixed-оверлей, который (в отличие от Radix Dialog) не лочит body сам.
  useEffect(() => {
    if (!details) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [details]);

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
    if (invites === null) return;
    const items = invites;
    if (items.length === 0) {
      setInviteEventJoined(new Set());
      setInvitesDetailsLoaded(true);
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
      })
      .finally(() => {
        if (!cancelled) setInvitesDetailsLoaded(true);
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
    if (!props.me?.playerId || !hasToken()) {
      setRatingHistoryLoaded(true);
      return;
    }
    let cancelled = false;
    api
      .getRatingHistory()
      .then((h) => { if (!cancelled) setRatingHistory(h); })
      .catch(() => { if (!cancelled) setRatingHistory([]); })
      .finally(() => { if (!cancelled) setRatingHistoryLoaded(true); });
    return () => { cancelled = true; };
  }, [props.me?.playerId]);

  useEffect(() => {
    // Лучших напарников грузим лениво — только при открытии вкладки «Напарники».
    if (profileTab !== "partners" || partners !== null || !props.me?.playerId) return;
    let cancelled = false;
    setPartnersLoading(true);
    setPartnersError(null);
    api
      .topPartners(props.me.playerId, 3)
      .then((d) => { if (!cancelled) setPartners(d); })
      .catch((e: any) => { if (!cancelled) setPartnersError(e?.message ?? "Ошибка"); })
      .finally(() => { if (!cancelled) setPartnersLoading(false); });
    return () => { cancelled = true; };
  }, [profileTab, partners, props.me?.playerId]);

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
                    setDetails(sortMatchesByRound(res));
                    setDetailsEventId(it.eventId);
                    setDetailsStatsOpen(false);
                    setDetailsRounds([]);
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

  const pageLoading =
    friends === null ||
    invites === null ||
    !invitesDetailsLoaded ||
    historyLoading ||
    !ratingHistoryLoaded;

  if (pageLoading) {
    return (
      <div className="space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">Профиль</h1>
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Загрузка…
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <Card className="overflow-hidden border-border/50">
          {/*
            Cover-баннер = стилизованное поле падел-корта (вид сверху). Чистый зелёный
            градиент (без оранжевого accent — он давал мутный край), поверх — SVG-разметка
            корта: рамка, сетка по центру, линии подачи. preserveAspectRatio=slice растягивает
            корт по ширине баннера. Линии белые полупрозрачные — читаются в обеих темах.
          */}
          <div className="relative -mt-6 h-20 md:h-24 overflow-hidden bg-gradient-to-br from-primary/35 via-primary/15 to-primary/5" aria-hidden="true">
            {/* preserveAspectRatio=none — корт растягивается на весь баннер до краёв
               (со slice верх/низ обрезались). Линии вплотную к кромкам блока. */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 200 64"
              preserveAspectRatio="none"
              fill="none"
            >
              <g stroke="rgba(255,255,255,0.32)" strokeWidth="0.5" strokeLinecap="round" vectorEffect="non-scaling-stroke">
                {/* внешняя рамка корта — почти до кромок баннера */}
                <rect x="2" y="2" width="196" height="60" rx="1" />
                {/* сетка по центру (поперёк) — пунктиром, чуть ярче */}
                <line x1="100" y1="2" x2="100" y2="62" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeDasharray="2.5 1.8" />
                {/* линии подачи по обе стороны от сетки */}
                <line x1="58" y1="2" x2="58" y2="62" />
                <line x1="142" y1="2" x2="142" y2="62" />
                {/* центральные линии зон подачи (от линии подачи к задней стенке) */}
                <line x1="2" y1="32" x2="58" y2="32" />
                <line x1="142" y1="32" x2="198" y2="32" />
              </g>
            </svg>
          </div>
          <CardContent className="relative z-10 -mt-8 md:-mt-9 pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="flex h-24 w-24 -mt-7 items-center justify-center rounded-2xl border-4 border-background bg-gradient-to-br from-primary/20 to-primary/5 shadow-xl overflow-hidden">
                  {avatar ? (
                    <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-12 w-12 text-primary" />
                  )}
                </div>
                <div className="relative top-3 pb-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl md:text-3xl font-bold">{viewMe.name}</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditProfileOpen(true)}
                      aria-label="Редактировать профиль"
                      title="Редактировать профиль"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="flex items-center gap-2 text-muted-foreground mt-1">
                    <Mail className="h-4 w-4" />
                    {viewMe.email}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge className="h-8 gap-1.5 px-3 py-0 bg-primary/10 text-primary border border-primary/20 text-sm font-medium">
                <Trophy className="h-3.5 w-3.5" />
                {calibration ? "на калибровке" : "Активен"}
              </Badge>
              {viewMe.gender ? (
                <Badge variant="secondary" className="h-8 gap-1.5 px-3 py-0 text-sm font-medium">
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
                  <Badge variant="secondary" className="h-8 gap-1.5 px-3 py-0 text-sm font-medium">
                    <span className="text-[10px] uppercase text-muted-foreground">ID</span>
                    {formatPublicId(viewMe.publicId)}
                  </Badge>
                </button>
                <span
                  className={cn(
                    "pointer-events-none absolute -top-2 right-0 translate-y-[-100%] rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300 transition-all duration-200",
                    idCopied ? "opacity-100 translate-y-[-110%]" : "opacity-0 translate-y-[-80%]",
                  )}
                >
                  Скопировано
                </span>
              </div>
            </div>

            {/* Restyle B: «карточка игрока» — ключевые цифры крупно, scoreboard-стиль. */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-center">
                <p className="font-display text-3xl sm:text-4xl font-bold leading-none tabular-nums">
                  {calibration ? "—" : viewMe.rating}
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Рейтинг</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-center">
                <p className="font-display text-3xl sm:text-4xl font-bold leading-none tabular-nums text-primary">
                  {calibration ? "—" : ntrpLevel(viewMe.rating)}
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">NTRP</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-center">
                <p className="font-display text-3xl sm:text-4xl font-bold leading-none tabular-nums">
                  {viewMe.gamesPlayed}
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Матчей</p>
              </div>
            </div>

            {/*
              Restyle B: прогресс до следующего уровня NTRP. Пороги захардкожены в NTRP_BOUNDS
              (зеркало lib/rating.ts). При калибровке рейтинг ещё «—», поэтому прогресс прячем,
              чтобы не вводить в заблуждение. На максимальном уровне (hi === Infinity) — просто метка.
            */}
            {!calibration ? (() => {
              const rating = viewMe.rating as number;
              const idx = NTRP_BOUNDS.findIndex((b) => rating >= b.lo && rating < b.hi);
              const current = idx >= 0 ? NTRP_BOUNDS[idx] : NTRP_BOUNDS[NTRP_BOUNDS.length - 1];
              if (current.hi === Infinity) {
                return <div className="mt-4 text-xs text-muted-foreground">Максимальный уровень NTRP</div>;
              }
              const next = NTRP_BOUNDS[idx + 1];
              const nextLevel = next ? next.level : current.level;
              const pct = Math.max(0, Math.min(100, Math.round(((rating - current.lo) / (current.hi - current.lo)) * 100)));
              const remaining = Math.max(0, current.hi - rating);
              return (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-display font-bold tabular-nums text-foreground">
                      NTRP {current.level} <span className="text-muted-foreground">▸ {nextLevel}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">ещё {remaining} до {nextLevel}</span>
                  </div>
                  <div
                    className="h-2 rounded-full bg-primary/15 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Прогресс до следующего уровня NTRP"
                  >
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })() : null}

            {calibration ? (
              <div className="mt-6 rounded-lg border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Калибровка: <strong>{calibrationPlayed}/30</strong> матчей сыграно
                  </p>
                </div>
                {/*
                  Trough намеренно тонкий и приглушённый: при 0/30 раньше выглядело как
                  «прогресс на всю ширину», хотя fill 0px. Уменьшили контраст trough'а
                  и добавили aria-атрибуты для скринридеров.
                */}
                <div
                  className="h-2 rounded-full bg-amber-500/15 dark:bg-amber-500/10 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={calibrationPlayed}
                  aria-valuemin={0}
                  aria-valuemax={30}
                  aria-label="Прогресс калибровки"
                >
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${(calibrationPlayed / 30) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}

          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/50">
        {(() => {
          const invitesCount = (invites ?? [])
            .filter((inv) => !isPastDate(inv.eventDate))
            .filter((inv) => !inviteEventJoined.has(inv.eventId)).length;
          const friendsCount = friends?.friends?.length ?? 0;
          const tabBtn = (active: boolean) =>
            cn(
              // Мобилка: равная ширина (flex-1), вертикально иконка+подпись, мельче — все 4 влезают без скролла.
              // Десктоп: компактные вкладки по содержимому (flex-none), прижатые влево, горизонтально.
              "flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] leading-tight transition-colors sm:flex-none sm:flex-row sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm",
              active
                ? "text-foreground font-medium border-b-2 border-primary -mb-px"
                : "text-muted-foreground",
            );
          return (
            <div className="flex w-full border-b border-border">
              {ratingHistory.length > 1 && (
                <button
                  type="button"
                  onClick={() => setProfileTab("graph")}
                  className={tabBtn(profileTab === "graph")}
                >
                  <TrendingUp className="h-4 w-4 shrink-0" />
                  <span>График</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setProfileTab("history")}
                className={tabBtn(profileTab === "history")}
              >
                <Calendar className="h-4 w-4 shrink-0" />
                <span>История</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("friends")}
                className={tabBtn(profileTab === "friends")}
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>Друзья</span>
                {friendsCount > 0 && <span className="hidden tabular-nums sm:inline">({friendsCount})</span>}
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("invites")}
                className={tabBtn(profileTab === "invites")}
              >
                <Gamepad2 className="h-4 w-4 shrink-0" />
                <span>Приглашения</span>
                {invitesCount > 0 && <span className="hidden tabular-nums sm:inline">({invitesCount})</span>}
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("partners")}
                className={tabBtn(profileTab === "partners")}
              >
                <Users2 className="h-4 w-4 shrink-0" />
                <span>Напарники</span>
              </button>
            </div>
          );
        })()}

        {profileTab === "invites" && (
          <>
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
          </>
        )}

        {profileTab === "friends" && (
          <>
            <CardHeader className="pb-4">
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
              </div>
              <CardDescription>Добавьте друзей по их ID</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
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
                <div className="rounded-lg border border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
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
                      <div className="flex items-center gap-3 rounded-lg p-2 px-2.5 cursor-pointer hover:bg-secondary/60 transition-colors">
                        <div className="h-9 w-9 shrink-0 rounded-full bg-primary/15 text-primary border border-primary/25 overflow-hidden flex items-center justify-center text-sm font-display font-bold">
                          {friend.avatarUrl ? (
                            <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            friend.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{friend.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">NTRP {friend.ntrp ?? ntrpLevel(friend.rating)}</p>
                        </div>
                        <span className="shrink-0 font-display font-bold tabular-nums text-base">{friend.rating}</span>
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
          </>
        )}

        {profileTab === "graph" && ratingHistory.length > 1 && (
          <>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  График рейтинга
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <RatingGraph points={ratingHistory} />
            </CardContent>
          </>
        )}

        {profileTab === "history" && (
          <>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  История матчей
                </CardTitle>
              </div>
              <CardDescription>История ваших игр и изменение рейтинга</CardDescription>
            </CardHeader>
            <CardContent>{historyContent}</CardContent>
          </>
        )}

        {profileTab === "partners" && (
          <>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Users2 className="h-5 w-5 text-primary" />
                Лучшие напарники
              </CardTitle>
              <CardDescription>С кем ты чаще всего побеждаешь</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
            {partnersLoading ? (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            ) : partnersError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                Не удалось загрузить: {partnersError}
              </div>
            ) : !partners?.length ? (
              <div className="text-sm text-muted-foreground">Пока недостаточно игр.</div>
            ) : (
              partners.map((p, i) => (
                <div
                  key={p.player.id}
                  className="flex items-center gap-3 rounded-lg bg-secondary/50 p-2 px-3"
                >
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <div className="h-10 w-10 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-sm font-semibold">
                    {p.player.avatarUrl ? (
                      <img src={p.player.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      p.player.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.player.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.gamesTogether} игр, {p.winsTogether} побед, {Math.round(p.winRate * 100)}% wr
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
          </>
        )}
        </Card>

        {details ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => { setDetails(null); setDetailsStatsOpen(false); }}>
            <div
              className="flex w-full max-w-5xl max-h-[90dvh] flex-col overflow-hidden rounded-xl border border-border bg-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{detailsTitle}</div>
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
                      <Pencil className="h-4 w-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Редактировать счет</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Закрыть"
                      onClick={() => { setDetails(null); setDetailsStatsOpen(false); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6" style={{ scrollbarWidth: "none" }}>
              <Button
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  if (detailsStatsOpen) {
                    setDetailsStatsOpen(false);
                    return;
                  }
                  if (detailsRounds.length > 0) {
                    setDetailsStatsOpen(true);
                    return;
                  }
                  if (!detailsEventId) return;
                  try {
                    const d = await api.getEventDetails(detailsEventId);
                    setDetailsRounds(d.rounds ?? []);
                    setDetailsStatsOpen(true);
                  } catch {}
                }}
              >
                <Trophy className="h-4 w-4 mr-1.5" />
                Статистика
              </Button>

              {detailsStatsOpen && detailsRounds.length > 0 ? (
                <EventLeaderboard rounds={detailsRounds} className="mt-4" />
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
            </div>
            </div>
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
              const savedEventId = editGameEventId;
              setEditGameOpen(false);
              setEditGameEventId(null);
              if (detailsEventId === savedEventId && savedEventId) {
                try {
                  // Обновляем и список истории, и ОТКРЫТУЮ модалку деталей (счёт по матчам),
                  // иначе после правки в модалке оставался старый счёт.
                  const [updatedList, updatedDetails] = await Promise.all([
                    api.myHistory(),
                    api.myHistoryEvent(savedEventId),
                  ]);
                  setHistory(updatedList);
                  setDetails(sortMatchesByRound(updatedDetails));
                  // Если открыт блок «Статистика»/таблица лидеров — подтянем свежие раунды.
                  if (detailsRounds.length > 0) {
                    try {
                      const d = await api.getEventDetails(savedEventId);
                      setDetailsRounds(d.rounds ?? []);
                    } catch {}
                  }
                } catch {}
              }
            }}
          />
        ) : null}

        <EditProfileDialog
          open={editProfileOpen}
          onOpenChange={setEditProfileOpen}
          me={viewMe}
          onSaved={(updated) => {
            setMeLive(updated);
            props.onMeUpdate?.(updated);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
