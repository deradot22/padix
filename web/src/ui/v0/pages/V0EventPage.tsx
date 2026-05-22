import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Clock, Globe, Lock, MapPin, Pencil, Repeat, Scale, Share2, Target, Trash2, Trophy, UserPlus, Users, Zap, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, BalancePreview, EventDetails, FriendItem, FriendsSnapshot, Match } from "../../../lib/api";
import { PlayerTooltip } from "@/components/player-tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModalScrollArea } from "@/components/ui/modal-scroll-area";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker, TimePicker } from "@/components/ui/date-picker";
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

function roundWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "равный раунд";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "равных раунда";
  return "равных раундов";
}

function pairingLabel(mode?: string): string {
  if (mode === "BALANCED") return "Равный бой";
  return "Каждый с каждым";
}

export function V0EventPage(props: { me: any; meLoaded?: boolean }) {
  const { eventId } = useParams();
  const location = useLocation();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editPoints, setEditPoints] = useState<number | "">("");
  const [editCourts, setEditCourts] = useState<number | "">("");
  const [editPairing, setEditPairing] = useState<"ROUND_ROBIN" | "BALANCED">("ROUND_ROBIN");
  const [editVisibility, setEditVisibility] = useState<"PRIVATE" | "PUBLIC">("PUBLIC");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const editOpenRef = useRef(false);
  useEffect(() => { editOpenRef.current = editOpen; }, [editOpen]);
  const modalOpenRef = useRef(false);
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
  // Авто-скрытие info-сообщений через 4 сек, чтобы не залипали
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<FriendsSnapshot | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [startPromptOpen, setStartPromptOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [finalRoundLocked, setFinalRoundLocked] = useState(false);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<"A" | "B">("A");
  const [scoreByMatch, setScoreByMatch] = useState<Record<string, { a: number; b: number }>>({});
  const [autoFilledByMatch, setAutoFilledByMatch] = useState<Record<string, boolean>>({});
  const [scoreSavingId, setScoreSavingId] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scorePadOpen, setScorePadOpen] = useState(false);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const activeMatchRef = useRef<HTMLDivElement | null>(null);
  const activeRoundRef = useRef<HTMLDivElement | null>(null);
  const roundsScrollRef = useRef<HTMLDivElement | null>(null);
  const userCollapsedRef = useRef(false);
  const [finishedMatchIds, setFinishedMatchIds] = useState<Set<string>>(new Set());
  const autoSavingRef = useRef<Set<string>>(new Set());
  const [editScoresOpen, setEditScoresOpen] = useState(false);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balancePreview, setBalancePreview] = useState<BalancePreview | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);
  useEffect(() => {
    modalOpenRef.current =
      balanceModalOpen || editOpen || inviteOpen || roundsOpen || statsOpen || startPromptOpen || editScoresOpen || scorePadOpen;
  }, [balanceModalOpen, editOpen, inviteOpen, roundsOpen, statsOpen, startPromptOpen, editScoresOpen, scorePadOpen]);

  const navigateAfterScore = (rounds: EventDetails["rounds"], savedMatchId: string) => {
    const currentIdx = rounds.findIndex((round) =>
      round.matches.some((m) => m.id === savedMatchId),
    );
    if (currentIdx < 0) return;
    const currentRound = rounds[currentIdx];
    // Find next unscored match in the same round (skip current)
    const nextUnscored = currentRound.matches.find(
      (m) => m.id !== savedMatchId && m.status !== "FINISHED" && !m.score?.points,
    );
    if (nextUnscored) {
      setActiveMatchId(nextUnscored.id);
      setScorePadOpen(false);
    } else {
      // Переход на следующий раунд — сразу помечаем сохранённый матч, чтобы «Сыгран» отобразился до следующего рендера
      setFinishedMatchIds((prev) => new Set([...prev, savedMatchId]));
      const nextRound = rounds[currentIdx + 1];
      if (nextRound) {
        setExpandedRoundId(nextRound.id);
        setActiveMatchId(nextRound.matches[0]?.id ?? null);
      }
      setScorePadOpen(false);
    }
  };

  useEffect(() => {
    // Load current user's avatar from backend (via props.me)
    setMyAvatar(props.me?.avatarUrl ?? null);
  }, [props.me?.avatarUrl]);

  /** Auto-save score as draft whenever the user enters/changes points */
  const lastAutoSavedRef = useRef<Record<string, string>>({});
  const prevActiveMatchIdRef = useRef<string | null>(null);

  const saveDraftIfNeeded = (matchId: string, a: number, b: number) => {
    const e = data?.event;
    if (!eventId || !data?.isAuthor || !e || e.status !== "IN_PROGRESS" || e.scoringMode !== "POINTS") return;
    const key = `${matchId}:${a},${b}`;
    if (lastAutoSavedRef.current[matchId] === key) return;
    api
      .saveDraftScore(matchId, { teamAPoints: a, teamBPoints: b })
      .then(() => {
        lastAutoSavedRef.current[matchId] = key;
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!activeMatchId) return;
    const prev = prevActiveMatchIdRef.current;
    if (prev && prev !== activeMatchId) {
      const s = scoreByMatch[prev];
      if (s && (s.a > 0 || s.b > 0)) saveDraftIfNeeded(prev, s.a, s.b);
    }
    prevActiveMatchIdRef.current = activeMatchId;
  }, [activeMatchId]);

  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollCancelledRef = useRef(false);
  const scrollToBottomRef = useRef(false);
  /** Scroll: при открытии — к раунду ("Раунд N"), при клике на счёт — к матчу с раскрытой клавиатурой */
  useEffect(() => {
    if (!roundsOpen) return;
    scrollCancelledRef.current = false;
    const scrollToBottom = scrollToBottomRef.current;
    const scrollToRound = !scorePadOpen && !scrollToBottom;
    const padOpening = scorePadOpen && !!activeMatchId;
    const delay = scrollToRound || scrollToBottom ? 300 : padOpening ? 20 : 80;
    const maxRetries = 20;
    let retries = 0;
    const attemptScroll = () => {
      if (scrollCancelledRef.current) return;
      const scrollEl = roundsScrollRef.current;
      if (!scrollEl) {
        if (retries < maxRetries) {
          retries++;
          scrollTimeoutRef.current = setTimeout(attemptScroll, 80);
        }
        return;
      }
      if (scrollToBottom) {
        scrollToBottomRef.current = false;
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
        return;
      }
      const el = scrollToRound ? activeRoundRef.current : activeMatchRef.current;
      if (!el) {
        if (retries < maxRetries) {
          retries++;
          scrollTimeoutRef.current = setTimeout(attemptScroll, 80);
        }
        return;
      }
      const targetRect = el.getBoundingClientRect();
      const containerRect = scrollEl.getBoundingClientRect();
      if (padOpening) {
        const fitsCompletely = targetRect.height <= containerRect.height - 16;
        const newScrollTop = fitsCompletely
          ? scrollEl.scrollTop + (targetRect.top - containerRect.top) - 8
          : scrollEl.scrollTop + (targetRect.bottom - containerRect.bottom) + 16;
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTo({
          top: Math.max(0, Math.min(maxScroll, newScrollTop)),
          behavior: "smooth",
        });
        return;
      }
      const targetOffset = scrollEl.scrollTop + (targetRect.top - containerRect.top);
      const topPadding = scrollToRound ? 25 : 8;
      const newScrollTop = Math.max(0, targetOffset - topPadding);
      scrollEl.scrollTo({ top: newScrollTop, behavior: "smooth" });
    };
    scrollTimeoutRef.current = setTimeout(attemptScroll, delay);
    return () => {
      scrollCancelledRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [activeMatchId, scorePadOpen, roundsOpen, expandedRoundId]);

  useEffect(() => {
    const e = data?.event;
    if (
      !eventId ||
      !activeMatchId ||
      !data?.isAuthor ||
      !e ||
      e.status !== "IN_PROGRESS" ||
      e.scoringMode !== "POINTS"
    ) return;
    const current = scoreByMatch[activeMatchId];
    if (!current) return;
    const key = `${activeMatchId}:${current.a},${current.b}`;
    if (lastAutoSavedRef.current[activeMatchId] === key) return;
    const timer = setTimeout(() => saveDraftIfNeeded(activeMatchId, current.a, current.b), 700);
    return () => clearTimeout(timer);
  }, [eventId, activeMatchId, scoreByMatch, data?.event, data?.isAuthor]);

  /** Проверка, сыгран ли матч (для allPlayed и поиска первого несыгранного) */
  const isMatchFinished = (m: Match) => {
    if (m.status === "FINISHED") return true;
    if (finishedMatchIds.has(m.id)) return true;
    if (data?.event?.scoringMode === "POINTS") {
      const totalPoints = (data.event.pointsPerPlayerPerMatch ?? 6) * 4;
      const local = scoreByMatch[m.id];
      if (local && local.a + local.b === totalPoints) return true;
      const pts = m.score?.points;
      if (pts) {
        const a = pts.teamAPoints ?? 0;
        const b = pts.teamBPoints ?? 0;
        if (a + b === totalPoints) return true;
      }
    }
    return false;
  };

  const nextButtonLabel = useMemo<string | null>(() => {
    if (!data?.rounds || !activeMatchId) return null;
    const currentRoundIdx = data.rounds.findIndex((r) => r.matches.some((m) => m.id === activeMatchId));
    if (currentRoundIdx < 0) return null;
    const isLastRound = currentRoundIdx === data.rounds.length - 1;
    return isLastRound ? null : "Следующий раунд";
  }, [data, activeMatchId]);

  const renderTeamScore = (team: Match["teamA"], score: number, side: "left" | "right") => {
    const first = team[0];
    const second = team[1];
    const currentPlayerId = props.me?.playerId;
    const renderAvatar = (p?: { id?: string; name?: string; avatarUrl?: string | null }) => {
      const isMe = !!p?.id && p.id === currentPlayerId;
      const src = p?.avatarUrl || (isMe ? myAvatar : null);
      if (src) {
        return <img src={src} alt="Avatar" className="h-full w-full object-cover" />;
      }
      return (
        <div className="h-full w-full rounded-lg bg-primary/20 text-primary text-sm font-semibold flex items-center justify-center">
          {p?.name?.[0]?.toUpperCase?.() ?? "?"}
        </div>
      );
    };
    const avatars = (
      <div className="flex flex-col gap-2">
        <div className="h-11 w-11 rounded-lg overflow-hidden border border-border/60 bg-secondary/40 flex items-center justify-center">
          {renderAvatar(first)}
        </div>
        <div className="h-11 w-11 rounded-lg overflow-hidden border border-border/60 bg-secondary/40 flex items-center justify-center">
          {renderAvatar(second)}
        </div>
      </div>
    );
    // В модале «Раунды» подсказку с инфой игрока не показываем — иначе она перехватывает
    // клик по карточке команды и мешает вводу счёта. Рейтинг игрока виден на других страницах.
    const makePlayerTooltip = (p: typeof first, center = false) => {
      if (!p) return <span className={center ? "truncate w-full text-center" : "truncate"}>?</span>;
      return <span className={center ? "truncate w-full text-center" : "truncate"}>{p.name}</span>;
    };
    const names = (
      <div className="grid w-full min-w-0 grid-rows-[44px_44px] items-center gap-2 px-1 text-xs text-muted-foreground text-left">
        <div className="flex h-full items-center w-full min-w-0">{makePlayerTooltip(first)}</div>
        <div className="flex h-full items-center w-full min-w-0">{makePlayerTooltip(second)}</div>
      </div>
    );
    const mobileCenter = (
      <div className="flex min-w-0 flex-col items-center justify-center text-xs text-muted-foreground">
        {makePlayerTooltip(first, true)}
        <div className="text-2xl font-semibold text-foreground">{score}</div>
        {makePlayerTooltip(second, true)}
      </div>
    );
    return (
      <div className="w-full">
        <div className="sm:hidden">
          {side === "left" ? (
            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2">
              <div className="flex items-center justify-center">{avatars}</div>
              {mobileCenter}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-2">
              {mobileCenter}
              <div className="flex items-center justify-center">{avatars}</div>
            </div>
          )}
        </div>
        <div className="hidden sm:block">
          {side === "left" ? (
            <div className="grid grid-cols-[44px_minmax(0,1fr)_48px] items-center gap-2">
              <div className="flex items-center justify-center">{avatars}</div>
              <div className="min-w-0">{names}</div>
              <div className="text-center text-3xl font-semibold">{score}</div>
            </div>
          ) : (
            <div className="grid grid-cols-[48px_minmax(0,1fr)_44px] items-center gap-2">
              <div className="text-center text-3xl font-semibold">{score}</div>
              <div className="min-w-0">{names}</div>
              <div className="flex items-center justify-center">{avatars}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

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
    if (!eventId) return;
    const status = data?.event?.status;
    if (!status) return;
    const active = ["OPEN_FOR_REGISTRATION", "REGISTRATION_CLOSED", "IN_PROGRESS"];
    if (!active.includes(status)) return;

    const poll = () => {
      if (document.hidden) return;
      // Не обновляем data пока открыт любой модал — иначе ремаунт смажет state ввода
      // и/или заставляет тяжёлый ре-рендер прямо в момент взаимодействия (тормозит кнопки).
      if (editOpenRef.current) return;
      if (modalOpenRef.current) return;
      api.getEventDetails(eventId).then(setData).catch(() => {});
    };
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [eventId, data?.event?.status]);

  // Live-обновление прогноза баланса по мере регистрации игроков.
  // Дёргаем balance-preview при каждом изменении состава/режима/раундов в режиме BALANCED,
  // пока эвент ещё не стартовал.
  const registeredCount = data?.registeredPlayers?.length ?? 0;
  const evStatus = data?.event?.status;
  const evPairingMode = data?.event?.pairingMode;
  const evCourtsCount = data?.event?.courtsCount;
  const evRoundsPlanned = data?.event?.roundsPlanned;
  useEffect(() => {
    if (!eventId) return;
    const beforeStart = evStatus === "OPEN_FOR_REGISTRATION" || evStatus === "REGISTRATION_CLOSED";
    if (!beforeStart || evPairingMode !== "BALANCED" || registeredCount < 4) {
      setBalancePreview(null);
      return;
    }
    let cancelled = false;
    api.getBalancePreview(eventId)
      .then((p) => { if (!cancelled) setBalancePreview(p); })
      .catch(() => { if (!cancelled) setBalancePreview(null); });
    return () => { cancelled = true; };
  }, [eventId, evStatus, evPairingMode, evCourtsCount, evRoundsPlanned, registeredCount]);

  const prevEventIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (prevEventIdRef.current !== eventId) {
      prevEventIdRef.current = eventId ?? null;
      userCollapsedRef.current = false;
      setFinishedMatchIds(new Set());
    }
    if (data.event?.status === "FINISHED") setActionError(null);
    if (eventId) {
      const stored = localStorage.getItem(`padix_final_round_${eventId}`);
      setFinalRoundLocked(stored === "1");
    }
    const rounds = data.rounds ?? [];
    if (rounds.length > 0) {
      const fallbackRoundId = rounds[0].id;
      const currentValid = expandedRoundId && rounds.some((r) => r.id === expandedRoundId);
      const keepCollapsed = expandedRoundId === null && userCollapsedRef.current;
      const nextExpandedId = currentValid ? expandedRoundId : keepCollapsed ? null : fallbackRoundId;
      if (nextExpandedId !== expandedRoundId) {
        setExpandedRoundId(nextExpandedId);
      }
      const activeRound = rounds.find((r) => r.id === nextExpandedId) ?? rounds[0];
      if (activeRound?.matches?.length) {
        const stillInRound = activeMatchId && activeRound.matches.some((m) => m.id === activeMatchId);
        if (!stillInRound) {
          const totalPoints = (data.event?.pointsPerPlayerPerMatch ?? 6) * 4;
          const matchFinished = (m: Match) => {
            if (m.status === "FINISHED") return true;
            if (finishedMatchIds.has(m.id)) return true;
            if (data?.event?.scoringMode === "POINTS") {
              const local = scoreByMatch[m.id];
              if (local && local.a + local.b === totalPoints) return true;
              const pts = m.score?.points;
              if (pts && (pts.teamAPoints ?? 0) + (pts.teamBPoints ?? 0) === totalPoints) return true;
            }
            return false;
          };
          const firstUnscored = activeRound.matches.find((m) => !matchFinished(m));
          setActiveMatchId(firstUnscored?.id ?? activeRound.matches[0].id);
        }
      }
    }
    setScoreByMatch((prev) => {
      const next = { ...prev };
      rounds.flatMap((r) => r.matches).forEach((m) => {
        if (next[m.id]) return;
        const points = m.score?.points;
        if (points) {
          const a = points.teamAPoints ?? 0;
          const b = points.teamBPoints ?? 0;
          next[m.id] = { a, b };
          lastAutoSavedRef.current[m.id] = `${m.id}:${a},${b}`;
          return;
        }
        next[m.id] = { a: 0, b: 0 };
      });
      return next;
    });
  }, [data, expandedRoundId, activeMatchId]);

  /** Синхронизируем finishedMatchIds с данными API — чтобы «Сыгран» отображался сразу после сохранения */
  useEffect(() => {
    if (!data?.rounds) return;
    const fromApi = new Set(
      data.rounds.flatMap((r) => r.matches).filter((m) => m.status === "FINISHED").map((m) => m.id),
    );
    if (fromApi.size === 0) return;
    setFinishedMatchIds((prev) => {
      const merged = new Set([...prev, ...fromApi]);
      if (merged.size === prev.size && [...merged].every((id) => prev.has(id))) return prev;
      return merged;
    });
  }, [data]);

  const statsRows = useMemo(() => {
    if (!data?.rounds?.length) return [];
    const totals = new Map<string, { id: string; name: string; points: number; avatarUrl?: string | null }>();

    data.rounds.flatMap((r) => r.matches).forEach((m) => {
      const score = m.score;
      if (!score) return;
      const mode = score.mode;
      if (mode !== "POINTS") return;
      const pointsA = score.points?.teamAPoints ?? 0;
      const pointsB = score.points?.teamBPoints ?? 0;

      m.teamA.forEach((p) => {
        if (!p?.id) return;
        const row = totals.get(p.id) ?? { id: p.id, name: p.name, points: 0, avatarUrl: p.avatarUrl };
        row.points += pointsA;
        totals.set(p.id, row);
      });
      m.teamB.forEach((p) => {
        if (!p?.id) return;
        const row = totals.get(p.id) ?? { id: p.id, name: p.name, points: 0, avatarUrl: p.avatarUrl };
        row.points += pointsB;
        totals.set(p.id, row);
      });
    });

    return Array.from(totals.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [data]);

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
            state={location.state}
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

    // PRIVATE-игра, к которой у юзера нет доступа: показываем заглушку без раундов/игроков.
    if (data.accessRestricted) {
      const ev = data.event;
      return (
        <div className="mx-auto max-w-xl space-y-4 py-6">
          <Link
            to="/games"
            state={location.state}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            К списку игр
          </Link>
          <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-2xl">
              <Lock className="h-6 w-6 text-muted-foreground" />
              <span className="font-semibold">Приватная игра</span>
            </div>
            <div className="space-y-1.5">
              <div className="text-lg font-medium">{ev.title || "Игра"}</div>
              <div className="text-sm text-muted-foreground">
                {ev.date} · {ev.startTime}–{ev.endTime} · Кортов: {ev.courtsCount}
              </div>
              <div className="text-sm text-muted-foreground">
                Организатор: <span className="text-foreground font-medium">{data.authorName}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Записано: <span className="text-foreground font-medium tabular-nums">{ev.registeredCount}/{ev.courtsCount * 4}</span>
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
              Состав, раунды и счёт доступны только участникам игры и приглашённым.
              Попроси организатора пригласить тебя — приглашение придёт в раздел уведомлений.
            </div>
          </div>
        </div>
      );
    }

    const e = data.event;
    const registered = data.registeredPlayers ?? [];
    const pending = data.pendingCancelRequests ?? [];
    const meId = props.me?.playerId;
    const myPublicId = props.me?.publicId;
    const isRegistered = !!meId && registered.some((p) => p.id === meId);
    const isAuthor = data.isAuthor;

    // Совместный ввод счёта: участник матча может ввести счёт своего матча первым.
    // Автор может всё (включая перезапись и редактирование после FINISHED).
    const isMyMatch = (m: Match): boolean =>
      !!meId && (m.teamA.some((p) => p.id === meId) || m.teamB.some((p) => p.id === meId));
    // Финальный счёт = есть submittedByUserId ИЛИ матч уже FINISHED (для исторических данных без submittedBy).
    const hasFinalScore = (m: Match): boolean =>
      m.status === "FINISHED" || !!m.submittedByUserId;
    const canSubmitScore = (m: Match): boolean =>
      isAuthor || (isMyMatch(m) && !hasFinalScore(m));
    // Доступ к модалу «Раунды» для всех зарегистрированных, не только тех, кто уже в текущем матче
    // (резервы тоже могут смотреть и ввести счёт в свой матч, когда их поставят).
    const isParticipantOfEvent =
      isRegistered ||
      (!!meId && (data.rounds ?? []).some((r) => r.matches.some(isMyMatch)));
    const progressPercent = Math.min(100, (registered.length / Math.max(1, e.courtsCount * 4)) * 100);
    const friendPublicIds = new Set((friends?.friends ?? []).map((f) => f.publicId));
    const outgoingPublicIds = new Set((friends?.outgoing ?? []).map((f) => f.publicId));

    return (
      <>
        <div className="space-y-8 pb-8">
        <Link
          to="/games"
          state={location.state}
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
                  {e.seriesId ? (
                    isAuthor ? (
                      <Link
                        to="/settings?tab=subscriptions"
                        className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-sm font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                        По подписке{e.seriesTitle ? `: ${e.seriesTitle}` : ""}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-1 text-sm font-medium text-sky-300/80">
                        <Repeat className="h-3.5 w-3.5" />
                        Регулярная{e.seriesTitle ? `: ${e.seriesTitle}` : ""}
                      </span>
                    )
                  ) : null}
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
                        className="h-11 w-full sm:w-[240px] px-6 rounded-md border border-primary bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors inline-flex items-center justify-center"
                        disabled={canceling}
                        onClick={async () => {
                          if (!eventId) return;
                          setCanceling(true);
                          setActionError(null);
                          setInfo(null);
                          try {
                            await api.cancelRegistration(eventId);
                            const refreshed = await api.getEventDetails(eventId);
                            setData(refreshed);
                            setInfo("Регистрация отменена");
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
                        className="h-11 w-full sm:w-[240px] px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                        disabled={registering}
                        onClick={async () => {
                          if (!eventId) return;
                          if (!meId) return;
                          setRegistering(true);
                          setActionError(null);
                          setInfo(null);
                          try {
                            await api.registerForEvent(eventId, meId);
                            const refreshed = await api.getEventDetails(eventId);
                            setData(refreshed);
                            setInfo("Вы записаны");
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

                    <div className="flex flex-wrap items-center gap-2">
                      {isAuthor && e.status === "OPEN_FOR_REGISTRATION" ? (
                        <button
                          type="button"
                          className="w-full sm:w-[240px] h-11 px-6 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
                          disabled={closing}
                          onClick={async () => {
                            if (!eventId) return;
                            setClosing(true);
                            setActionError(null);
                            setInfo(null);
                            try {
                              const preview = await api.getBalancePreview(eventId);
                              if (preview.shouldWarn) {
                                setBalancePreview(preview);
                                setBalanceModalOpen(true);
                                setClosing(false);
                                return;
                              }
                            } catch (err: any) {
                              // Превью не критично — если упало, продолжаем по обычному пути
                              console.error("balance preview failed", err);
                            }
                            const ok = await confirm({
                              title: "Закрыть регистрацию?",
                              description: "Новые игроки не смогут присоединиться к игре. После закрытия можно будет начать игру.",
                              confirmLabel: "Закрыть",
                            });
                            if (!ok) {
                              setClosing(false);
                              return;
                            }
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
                          className="w-full sm:w-[240px] h-11 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center justify-center"
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
                    <div className="flex flex-wrap items-center gap-2">
                      {isAuthor || isParticipantOfEvent ? (
                        <button
                          type="button"
                          className="h-11 w-full sm:w-auto px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                          onClick={() => {
                            setActionError(null);
                            const rounds = data?.rounds ?? [];
                            const allMatches = rounds.flatMap((r) => r.matches);
                            // Для не-автора-участника приоритет — собственный неввёденный матч.
                            // Иначе (или для автора) — первый неввёденный.
                            const myUnscored = !isAuthor
                              ? allMatches.find((m) => isMyMatch(m) && !hasFinalScore(m))
                              : undefined;
                            const targetMatch = myUnscored ?? allMatches.find((m) => !isMatchFinished(m));
                            if (targetMatch) {
                              userCollapsedRef.current = false;
                              const round = rounds.find((r) => r.matches.some((m) => m.id === targetMatch.id));
                              if (round) {
                                setExpandedRoundId(round.id);
                                setActiveMatchId(targetMatch.id);
                              }
                            } else {
                              userCollapsedRef.current = true;
                              setExpandedRoundId(null);
                              setActiveMatchId(null);
                              scrollToBottomRef.current = true;
                            }
                            setScorePadOpen(false);
                            setRoundsOpen(true);
                          }}
                        >
                          Ввести счёт
                        </button>
                      ) : (
                        <div className="text-sm text-muted-foreground">Игра идёт</div>
                      )}
                      <button
                        type="button"
                        className="h-11 w-full sm:w-auto px-6 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
                        onClick={() => setStatsOpen(true)}
                      >
                        Таблица лидеров
                      </button>
                    </div>

                    {info ? <div className="text-sm text-muted-foreground">{info}</div> : null}
                    {actionError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        {actionError}
                      </div>
                    ) : null}
                  </>
                ) : e.status === "FINISHED" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm text-muted-foreground">Игра завершена</div>
                    {isAuthor && (
                      <button
                        type="button"
                        className="h-11 w-full sm:w-auto px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                        onClick={() => setEditScoresOpen(true)}
                      >
                        Редактировать счет
                      </button>
                    )}
                    <button
                      type="button"
                      className="h-11 w-full sm:w-auto px-6 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
                      onClick={() => setStatsOpen(true)}
                    >
                      Таблица лидеров
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Статус: {statusLabel(e.status)}</div>
                )}

                <div className="flex items-center gap-2 self-start sm:self-end justify-start sm:justify-end flex-wrap">
                  <button
                    type="button"
                    className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                    title="Пригласить"
                    aria-label="Пригласить"
                    onClick={() => setInviteOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                  {isAuthor && e.status !== "FINISHED" && (
                    <button
                      type="button"
                      className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                      title="Редактировать игру"
                      aria-label="Редактировать игру"
                      onClick={() => {
                        setEditTitle(e.title ?? "");
                        setEditDate(typeof e.date === "string" ? e.date : "");
                        setEditStartTime(typeof e.startTime === "string" ? e.startTime.slice(0, 5) : "");
                        setEditEndTime(typeof e.endTime === "string" ? e.endTime.slice(0, 5) : "");
                        setEditPoints(typeof e.pointsPerPlayerPerMatch === "number" ? e.pointsPerPlayerPerMatch : "");
                        setEditCourts(typeof e.courtsCount === "number" ? e.courtsCount : "");
                        setEditPairing(e.pairingMode === "BALANCED" ? "BALANCED" : "ROUND_ROBIN");
                        setEditVisibility(e.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE");
                        setEditError(null);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {isAuthor && e.status === "OPEN_FOR_REGISTRATION" && (
                    <button
                      type="button"
                      className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors inline-flex items-center justify-center"
                      title="Удалить игру"
                      aria-label="Удалить игру"
                      onClick={async () => {
                        if (!eventId) return;
                        const ok = await confirm({
                          title: "Удалить игру?",
                          description: (
                            <>
                              Игра <b>{e.title}</b> будет удалена со всеми регистрациями.
                            </>
                          ),
                          warning: "Действие нельзя отменить.",
                          confirmLabel: "Удалить",
                          confirmVariant: "destructive",
                        });
                        if (!ok) return;
                        setActionError(null);
                        try {
                          await api.deleteEvent(eventId);
                          navigate("/games");
                        } catch (err: any) {
                          setActionError(err?.message ?? "Не удалось удалить игру");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                    title="Поделиться"
                    aria-label="Поделиться"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        setInfo("Ссылка скопирована");
                      } catch {
                        setInfo(window.location.href);
                      }
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={editOpen} onOpenChange={(o) => { if (!editSaving) setEditOpen(o); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Редактировать игру</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block mb-1 text-muted-foreground">Название</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                  value={editTitle}
                  onChange={(ev) => setEditTitle(ev.target.value)}
                />
              </div>
              <div>
                <label className="block mb-1 text-muted-foreground">Дата</label>
                <DatePicker value={editDate} onChange={setEditDate} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-muted-foreground">Начало</label>
                  <TimePicker value={editStartTime} onChange={setEditStartTime} />
                </div>
                <div>
                  <label className="block mb-1 text-muted-foreground">Окончание</label>
                  <TimePicker value={editEndTime} onChange={setEditEndTime} />
                </div>
              </div>
              {e.status === "OPEN_FOR_REGISTRATION" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 text-muted-foreground">Очков на игрока</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                        value={editPoints}
                        onChange={(ev) => setEditPoints(ev.target.value === "" ? "" : Number(ev.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-muted-foreground">Кортов</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                        value={editCourts}
                        onChange={(ev) => setEditCourts(ev.target.value === "" ? "" : Number(ev.target.value))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1 text-muted-foreground">Режим</label>
                    <select
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                      value={editPairing}
                      onChange={(ev) => setEditPairing(ev.target.value as "ROUND_ROBIN" | "BALANCED")}
                    >
                      <option value="ROUND_ROBIN">Каждый с каждым</option>
                      <option value="BALANCED">Равный бой</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Игра уже стартовала — можно редактировать только название, дату, время и видимость.
                </div>
              )}
              <div>
                <label className="block mb-1 text-muted-foreground">Видимость</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "PUBLIC" as const, icon: Globe, title: "Открытая", desc: "Видна всем, любой может записаться" },
                    { value: "PRIVATE" as const, icon: Lock, title: "Приватная", desc: "В /games видна, детали — только участникам" },
                  ]).map((opt) => {
                    const Icon = opt.icon;
                    const active = editVisibility === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditVisibility(opt.value)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-md border-2 p-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border bg-transparent hover:bg-secondary/30",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-4 w-4" />
                          <span className="text-sm font-medium">{opt.title}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground leading-snug">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {editError && <div className="text-destructive text-xs">{editError}</div>}
            </div>
            <div className="mt-4 flex items-center gap-2 justify-end">
              <Button variant="outline" className="bg-transparent" disabled={editSaving} onClick={() => setEditOpen(false)}>
                Отмена
              </Button>
              <Button
                disabled={editSaving}
                onClick={async () => {
                  if (!eventId) return;
                  setEditSaving(true);
                  setEditError(null);
                  try {
                    const payload: Record<string, unknown> = {
                      title: editTitle.trim(),
                      date: editDate,
                      startTime: editStartTime.length === 5 ? `${editStartTime}:00` : editStartTime,
                      endTime: editEndTime.length === 5 ? `${editEndTime}:00` : editEndTime,
                    };
                    if (e.status === "OPEN_FOR_REGISTRATION") {
                      if (editPoints !== "") payload.pointsPerPlayerPerMatch = editPoints;
                      if (editCourts !== "") payload.courtsCount = editCourts;
                      payload.pairingMode = editPairing;
                    }
                    // Видимость можно менять на любой стадии (кроме FINISHED, и туда мы edit-dialog не пускаем).
                    payload.visibility = editVisibility;
                    await api.updateEvent(eventId, payload);
                    const refreshed = await api.getEventDetails(eventId);
                    setData(refreshed);
                    setInfo("Игра обновлена.");
                    setEditOpen(false);
                  } catch (err: any) {
                    setEditError(err?.message ?? "Не удалось сохранить");
                  } finally {
                    setEditSaving(false);
                  }
                }}
              >
                {editSaving ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
                    className="flex flex-col gap-2 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-semibold">
                        {friend.name?.[0]?.toUpperCase?.() ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{friend.name}</p>
                        <p className="text-sm text-muted-foreground">Рейтинг: {friend.rating}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
                      {(() => {
                        const isInEvent = (data?.registeredPlayers ?? []).some(
                          (p) => p.publicId === friend.publicId
                        );
                        const sentInvite = !!invited[friend.publicId];
                        return (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="flex-1 sm:flex-none sm:w-[110px]"
                              disabled={!eventId || invitingId === friend.publicId || isInEvent}
                              title="Добавить в игру сразу, без согласия друга"
                              onClick={async () => {
                                if (!eventId) return;
                                setInvitingId(friend.publicId);
                                setFriendsError(null);
                                try {
                                  await api.addFriendToEvent(eventId, friend.publicId);
                                  const refreshed = await api.getEventDetails(eventId);
                                  setData(refreshed);
                                } catch (e: any) {
                                  setFriendsError(e?.message ?? "Не удалось добавить");
                                } finally {
                                  setInvitingId(null);
                                }
                              }}
                            >
                              {isInEvent ? (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  Добавлен
                                </>
                              ) : (
                                "Добавить"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 sm:flex-none sm:w-[110px]"
                              disabled={!eventId || invitingId === friend.publicId || isInEvent || sentInvite}
                              title="Отправить приглашение — друг сам решит присоединиться"
                              onClick={async () => {
                                if (!eventId) return;
                                setInvitingId(friend.publicId);
                                setFriendsError(null);
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
                              {sentInvite ? "Приглашён" : "Пригласить"}
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={balanceModalOpen} onOpenChange={(o) => { if (!closing && !switchingMode) setBalanceModalOpen(o); }}>
          <DialogContent className="sm:max-w-md">
            {balancePreview ? (
              <div className="space-y-4">
                <div className="flex justify-center pt-2">
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center ring-1",
                    balancePreview.severity === "LARGE" && "bg-rose-500/10 text-rose-400 ring-rose-500/30",
                    balancePreview.severity === "MEDIUM" && "bg-amber-500/10 text-amber-300 ring-amber-500/30",
                    balancePreview.severity === "SMALL" && "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
                  )}>
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                </div>

                <DialogHeader>
                  <DialogTitle className="text-center text-xl">
                    {balancePreview.maxGoodRounds === 0 ? (
                      "Нет равных раундов"
                    ) : (
                      <>
                        Возможно{" "}
                        <span className={cn(
                          balancePreview.severity === "LARGE" && "text-rose-400",
                          balancePreview.severity === "MEDIUM" && "text-amber-300",
                          balancePreview.severity === "SMALL" && "text-emerald-300",
                        )}>
                          {balancePreview.maxGoodRounds}
                        </span>{" "}
                        {roundWord(balancePreview.maxGoodRounds)}
                      </>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <p className="text-center text-sm text-muted-foreground leading-relaxed px-2">
                  {(() => {
                    const N = balancePreview.maxGoodRounds;
                    const req = balancePreview.requestedRounds;
                    const spread = balancePreview.ratingSpread;
                    if (N === 0) {
                      return `Состав слишком разнородный (разброс ${spread}) — нет варианта, где команды получились бы равны по силе.`;
                    }
                    if (req !== null && N < req) {
                      return `Разброс рейтингов ${spread}. С таким составом это максимум — больше равных раундов не получится. Запрошено ${req}.`;
                    }
                    return `Разброс рейтингов ${spread}, но команды получится сбалансировать во всех раундах.`;
                  })()}
                </p>

                <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center sm:justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setBalanceModalOpen(false)}
                    disabled={closing || switchingMode}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-transparent"
                    disabled={closing || switchingMode}
                    onClick={async () => {
                      if (!eventId) return;
                      setSwitchingMode(true);
                      setActionError(null);
                      try {
                        await api.updatePairingMode(eventId, "ROUND_ROBIN");
                        const refreshed = await api.getEventDetails(eventId);
                        setData(refreshed);
                        setBalanceModalOpen(false);
                        setInfo("Режим переключён на «Каждый с каждым». Теперь можно закрыть регистрацию.");
                      } catch (err: any) {
                        setActionError(err?.message ?? "Не удалось сменить режим");
                      } finally {
                        setSwitchingMode(false);
                      }
                    }}
                  >
                    {switchingMode ? "Переключаем…" : "Каждый с каждым"}
                  </Button>
                  <Button
                    disabled={closing || switchingMode || balancePreview.maxGoodRounds === 0}
                    onClick={async () => {
                      if (!eventId) return;
                      setClosing(true);
                      setActionError(null);
                      setInfo(null);
                      try {
                        await api.closeRegistration(eventId);
                        const refreshed = await api.getEventDetails(eventId);
                        setData(refreshed);
                        setBalanceModalOpen(false);
                        setInfo("Регистрация закрыта");
                        setStartPromptOpen(true);
                      } catch (err: any) {
                        setActionError(err?.message ?? "Ошибка закрытия");
                      } finally {
                        setClosing(false);
                      }
                    }}
                  >
                    {closing ? "Закрываем…" : "Продолжить"}
                  </Button>
                </div>
              </div>
            ) : null}
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

        {/* Компактная сводка на мобильном */}
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => setInfoExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card border border-border/50 hover:bg-card/80 transition-colors"
            aria-expanded={infoExpanded}
          >
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap text-left">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{e.courtsCount}</span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" />{pairingLabel(e.pairingMode)}</span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{registered.length}/{e.courtsCount * 4}</span>
              {balancePreview && balancePreview.severity !== "NONE" ? (
                <>
                  <span className="text-border">·</span>
                  <span className={cn(
                    "flex items-center gap-1",
                    balancePreview.severity === "LARGE" && "text-rose-300",
                    balancePreview.severity === "MEDIUM" && "text-amber-300",
                    balancePreview.severity === "SMALL" && "text-emerald-300",
                  )}>
                    <Scale className="h-3.5 w-3.5" />
                    {balancePreview.maxGoodRounds} {roundWord(balancePreview.maxGoodRounds)}
                  </span>
                </>
              ) : null}
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", infoExpanded && "rotate-180")} />
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-in-out overflow-hidden",
              infoExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">Корты</span>
                  </div>
                  <p className="text-2xl font-bold">{e.courtsCount}</p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Zap className="h-4 w-4" />
                    <span className="text-sm">Режим</span>
                  </div>
                  <p className="text-base font-bold leading-tight">{pairingLabel(e.pairingMode)}</p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span className="text-sm">{e.scoringMode === "POINTS" ? "Подач на игрока" : "Сетов"}</span>
                  </div>
                  <p className="text-2xl font-bold">{e.scoringMode === "POINTS" ? e.pointsPerPlayerPerMatch : e.setsPerMatch}</p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Игроков</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {registered.length}
                    <span className="text-base font-normal text-muted-foreground">/{e.courtsCount * 4}</span>
                  </p>
                </div>
                {balancePreview && balancePreview.severity !== "NONE" ? (
                  <div className={cn(
                    "p-4 rounded-xl bg-card border space-y-2 col-span-2",
                    balancePreview.severity === "LARGE" && "border-rose-500/40",
                    balancePreview.severity === "MEDIUM" && "border-amber-500/40",
                    balancePreview.severity === "SMALL" && "border-emerald-500/40",
                  )}>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Scale className="h-4 w-4" />
                      <span className="text-sm">Баланс</span>
                    </div>
                    <p className="text-2xl font-bold leading-none">
                      {balancePreview.maxGoodRounds}
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        {roundWord(balancePreview.maxGoodRounds)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      разброс {balancePreview.ratingSpread}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Полный grid на десктопе */}
        <div className={cn(
          "hidden md:grid grid-cols-2 gap-4",
          balancePreview && balancePreview.severity !== "NONE" ? "lg:grid-cols-5" : "lg:grid-cols-4"
        )}>
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

          {balancePreview && balancePreview.severity !== "NONE" ? (
            <div className={cn(
              "p-5 rounded-xl bg-card border space-y-2",
              balancePreview.severity === "LARGE" && "border-rose-500/40",
              balancePreview.severity === "MEDIUM" && "border-amber-500/40",
              balancePreview.severity === "SMALL" && "border-emerald-500/40",
            )}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Scale className="h-4 w-4" />
                <span className="text-sm">Баланс</span>
              </div>
              <p className="text-2xl font-bold leading-none">
                {balancePreview.maxGoodRounds}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {roundWord(balancePreview.maxGoodRounds)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                разброс {balancePreview.ratingSpread}
              </p>
            </div>
          ) : null}
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
                  "px-3 py-1.5 text-sm rounded-md whitespace-nowrap shrink-0",
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
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-5">
              {registered.map((p, idx) => (
                <PlayerTooltip
                  key={p.id}
                  player={{
                    id: p.id,
                    name: p.name,
                    rating: p.rating,
                    matches: p.gamesPlayed,
                    odid: p.publicId,
                    avatarUrl: p.avatarUrl,
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
                    const publicId = p.publicId;
                    if (publicId) {
                      setFriends((prev) =>
                        prev
                          ? {
                              ...prev,
                              outgoing: prev.outgoing.some((o) => o.publicId === publicId)
                                ? prev.outgoing
                                : [...prev.outgoing, { publicId, name: p.name }],
                            }
                          : prev,
                      );
                    }
                    return "Заявка отправлена";
                  }}
                >
                  <div className="group relative w-full p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10">
                    {isAuthor && data?.event?.status === "OPEN_FOR_REGISTRATION" ? (
                      <button
                        type="button"
                        className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center shadow-sm z-10"
                        title="Исключить"
                        aria-label="Исключить"
                        onClick={async (ev) => {
                          ev.stopPropagation();
                          if (!eventId) return;
                          const ok = await confirm({
                            title: "Исключить игрока?",
                            description: <>Игрок <b>{p.name}</b> будет удалён из регистрации.</>,
                            confirmLabel: "Исключить",
                            confirmVariant: "destructive",
                          });
                          if (!ok) return;
                          setActionError(null);
                          setInfo(null);
                          try {
                            await api.removePlayerFromEvent(eventId, p.id);
                            const refreshed = await api.getEventDetails(eventId);
                            setData(refreshed);
                            setInfo("Игрок исключен");
                          } catch (err: any) {
                            setActionError(err?.message ?? "Ошибка исключения");
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </div>
                    <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-2 overflow-hidden">
                      {p.avatarUrl || (p.id === meId && myAvatar) ? (
                        <img src={p.avatarUrl || myAvatar || ""} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        p.name?.[0]?.toUpperCase?.() ?? "?"
                      )}
                    </div>
                    <p className="text-sm font-medium text-center truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground text-center">{p.rating}</p>
                  </div>
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

        {isAuthor && pending.length > 0 ? (
          <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
            <div className="p-6 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Users className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Запросы на отмену</h2>
                    <p className="text-sm text-muted-foreground">Игроки хотят выйти из игры</p>
                  </div>
                </div>
                <span className="px-3 py-1.5 text-sm rounded-md bg-secondary text-secondary-foreground">
                  {pending.length}
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {pending.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">({p.rating})</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (!eventId) return;
                        try {
                          await api.approveCancel(eventId, p.id);
                          const refreshed = await api.getEventDetails(eventId);
                          setData(refreshed);
                        } catch (err: any) {
                          setActionError(err?.message ?? "Ошибка подтверждения");
                        }
                      }}
                    >
                      Подтвердить
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

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

            <ModalScrollArea ref={roundsScrollRef} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
              {(data.rounds ?? []).map((r, idx) => {
                const expanded = r.id === expandedRoundId;
                const isFinalRound = finalRoundLocked && idx === (data.rounds?.length ?? 0) - 1;
                const allPlayed = r.matches.every(isMatchFinished);
                const finishedCount = r.matches.filter(isMatchFinished).length;
                const canDeleteRound =
                  !!data.isAuthor &&
                  data.event?.status === "IN_PROGRESS" &&
                  (r.matches.length === 0 || finishedCount < r.matches.length);
                return (
                  <div
                    key={r.id}
                    ref={r.id === expandedRoundId ? activeRoundRef : undefined}
                    className={cn(
                      "rounded-xl border bg-card/50 shadow-sm p-0 transition-all scroll-mt-4 hover:shadow-md hover:bg-card",
                      allPlayed && !expanded ? "border-primary/30 bg-primary/5" : "border-border/70",
                    )}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        className="flex-1 flex items-center justify-between gap-3 p-4 text-left"
                        onClick={() => {
                          setExpandedRoundId((prev) => {
                            if (prev === r.id) {
                              userCollapsedRef.current = true;
                              return null;
                            }
                            userCollapsedRef.current = false;
                            return r.id;
                          });
                          setScorePadOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <div>
                            <div className="text-lg font-semibold flex items-center gap-2">
                              Раунд {r.roundNumber}
                              {isFinalRound && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                  <Trophy className="h-3.5 w-3.5" />
                                  Финальный
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Матчей: {r.matches.length}
                              {allPlayed && r.matches.length > 0 && " • Сыгран"}
                            </div>
                          </div>
                        </div>
                        <ChevronDown className={cn("h-5 w-5 transition-transform", expanded ? "rotate-180" : "")} />
                      </button>
                      {canDeleteRound && (
                        <button
                          type="button"
                          aria-label="Удалить раунд"
                          className="px-3 my-3 mr-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            if (!eventId) return;
                            const ok = await confirm({
                              title: "Удалить раунд?",
                              description: (
                                <>
                                  Раунд <b>{r.roundNumber}</b>
                                  {r.matches.length > 0
                                    ? ` и его ${r.matches.length} ${r.matches.length === 1 ? "матч" : r.matches.length < 5 ? "матча" : "матчей"} будут удалены.`
                                    : " будет удалён."} Действие нельзя отменить.
                                </>
                              ),
                              warning: finishedCount > 0 ? (
                                <>
                                  Из них <b>{finishedCount} {finishedCount === 1 ? "сыгран" : "сыграно"}</b> — счёт будет потерян. Рейтинги ещё не применены (применяются только при завершении игры).
                                </>
                              ) : undefined,
                              confirmLabel: "Удалить",
                              confirmVariant: "destructive",
                            });
                            if (!ok) return;
                            setActionError(null);
                            setInfo(null);
                            try {
                              await api.deleteRound(eventId, r.id);
                              const refreshed = await api.getEventDetails(eventId);
                              setData(refreshed);
                              if (expandedRoundId === r.id) setExpandedRoundId(null);
                              setInfo("Раунд удалён.");
                            } catch (err: any) {
                              setActionError(err?.message ?? "Не удалось удалить раунд");
                            }
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-400 ease-in-out overflow-hidden",
                        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                      <div className="px-4 pb-4">
                        <div className="space-y-3">
                          {r.matches.map((m) => {
                            const scores = scoreByMatch[m.id] ?? { a: 0, b: 0 };
                            const active = m.id === activeMatchId;
                            const finalScored = hasFinalScore(m);
                            const canEdit = canSubmitScore(m);
                            const showPadHere = active && scorePadOpen && canEdit;
                            // Подсказка для не-автора, почему карточка дизейблнута.
                            const lockHint = !canEdit && !isAuthor
                              ? finalScored
                                ? `Введён${m.submittedByName ? `: ${m.submittedByName}` : ""}. Изменить может только организатор.`
                                : !isMyMatch(m)
                                  ? "Этот матч введёт его участник или организатор."
                                  : null
                              : null;
                            const handleSelectTeam = (team: "A" | "B") => {
                              if (!canEdit) return;
                              setActiveMatchId(m.id);
                              setActiveTeam(team);
                              setScorePadOpen(true);
                            };
                            return (
                              <div
                                key={m.id}
                                ref={(el) => {
                                  if (m.id === activeMatchId) {
                                    (activeMatchRef as { current: HTMLDivElement | null }).current = el;
                                  }
                                }}
                                className={cn(
                                  "rounded-lg border p-3 transition-colors scroll-mt-4",
                                  finalScored
                                    ? "border-emerald-500/40 bg-emerald-500/5"
                                    : active
                                      ? "border-primary/50 bg-secondary/30 shadow-sm"
                                      : "border-border/50 bg-secondary/10",
                                )}
                              >
                                <div className="text-sm text-muted-foreground">{m.courtName ?? `Корт ${m.courtNumber}`}</div>
                                {lockHint && (
                                  <div className="mt-1 text-xs text-muted-foreground">{lockHint}</div>
                                )}
                                {props.me?.showWinProbability && typeof m.expectedA === "number" && !finalScored && (
                                  <WinProbabilityHint expectedA={m.expectedA} />
                                )}
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    aria-disabled={!canEdit}
                                    className={cn(
                                      "rounded-lg border px-3 py-3 text-center transition-colors",
                                      activeTeam === "A" && active && canEdit ? "border-primary text-primary" : "border-border",
                                      !canEdit && "opacity-70 cursor-not-allowed",
                                    )}
                                    onClick={() => handleSelectTeam("A")}
                                  >
                                    {renderTeamScore(m.teamA, scores.a, "left")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    aria-disabled={!canEdit}
                                    className={cn(
                                      "rounded-lg border px-3 py-3 text-center transition-colors",
                                      activeTeam === "B" && active && canEdit ? "border-primary text-primary" : "border-border",
                                      !canEdit && "opacity-70 cursor-not-allowed",
                                    )}
                                    onClick={() => handleSelectTeam("B")}
                                  >
                                    {renderTeamScore(m.teamB, scores.b, "right")}
                                  </button>
                                </div>
                                {showPadHere && (
                                  <div data-pad="1" className="mt-3 pt-3 border-t border-border/40">
                                      <div className="grid grid-cols-6 gap-2">
                                        {[0, ...Array.from({ length: (e.pointsPerPlayerPerMatch ?? 6) * 4 }, (_, i) => i + 1)].map((n) => (
                                          <button
                                            key={n}
                                            type="button"
                                            className="rounded-lg border border-border bg-secondary/20 py-2 text-sm font-semibold hover:bg-secondary"
                                            onClick={() => {
                                              const totalPoints = (e.pointsPerPlayerPerMatch ?? 6) * 4;
                                              const current = scoreByMatch[m.id] ?? { a: 0, b: 0 };
                                              let nextA = activeTeam === "A" ? n : current.a;
                                              let nextB = activeTeam === "B" ? n : current.b;
                                              const autoFilled = autoFilledByMatch[m.id];
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
                                                setAutoFilledByMatch((prev) => ({ ...prev, [m.id]: true }));
                                              }
                                              setScoreByMatch((prev) => ({
                                                ...prev,
                                                [m.id]: { a: nextA, b: nextB },
                                              }));
                                              if (nextA + nextB === totalPoints && eventId && !autoSavingRef.current.has(m.id)) {
                                                autoSavingRef.current.add(m.id);
                                                setScoreSavingId(m.id);
                                                setScoreError(null);
                                                api.submitScore(m.id, { teamAPoints: nextA, teamBPoints: nextB })
                                                  .then(async () => {
                                                    setFinishedMatchIds((prev) => new Set([...prev, m.id]));
                                                    setInfo("Счёт сохранён");
                                                    setScorePadOpen(false);
                                                    const refreshed = await api.getEventDetails(eventId);
                                                    setData(refreshed);
                                                  })
                                                  .catch(async (err: any) => {
                                                    setScoreError(err?.message ?? "Не удалось сохранить счёт");
                                                    // Возможен 409 «уже введён» — обновим, чтобы UI показал актуальный счёт/автора.
                                                    if (eventId) {
                                                      try {
                                                        const refreshed = await api.getEventDetails(eventId);
                                                        setData(refreshed);
                                                      } catch {
                                                        /* ignore */
                                                      }
                                                    }
                                                  })
                                                  .finally(() => {
                                                    autoSavingRef.current.delete(m.id);
                                                    setScoreSavingId(null);
                                                  });
                                              }
                                            }}
                                          >
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                    <div className="mt-3 text-xs">
                                      {scoreError && active ? (
                                        <span className="text-destructive">{scoreError}</span>
                                      ) : scoreSavingId === m.id ? (
                                        <span className="text-muted-foreground">Сохраняем…</span>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          Выберите значение для команды {activeTeam === "A" ? "слева" : "справа"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {r.matches.length > 0 && (!activeMatchId || !scorePadOpen) && (
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground">Нажмите на счёт команды, чтобы выбрать очки.</div>
                          </div>
                        )}
                        {nextButtonLabel && expanded && (
                          <div className="mt-4 flex justify-end">
                            <Button
                              size="sm"
                              disabled={scoreSavingId === activeMatchId}
                              onClick={async () => {
                                if (!eventId) return;
                                const rounds = data?.rounds ?? [];
                                const curIdx = rounds.findIndex((rr) => rr.matches.some((mm) => mm.id === activeMatchId));
                                const nextRound = curIdx >= 0 ? rounds[curIdx + 1] : null;
                                if (nextRound) {
                                  setExpandedRoundId(nextRound.id);
                                  setActiveMatchId(nextRound.matches[0]?.id ?? null);
                                  setScorePadOpen(false);
                                  setScoreError(null);
                                }
                              }}
                            >
                              {nextButtonLabel}
                            </Button>
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </ModalScrollArea>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={finalRoundLocked}
                  onClick={async () => {
                    if (!eventId) return;
                    setInfo(null);
                    setActionError(null);
                    try {
                      console.log("[EVENT] Нажата кнопка: + Раунд (addRound)", eventId);
                      await api.addRound(eventId);
                      const refreshed = await api.getEventDetails(eventId);
                      setData(refreshed);
                      setInfo("Раунд добавлен.");
                      const rounds = refreshed.rounds ?? [];
                      const newRound = rounds[rounds.length - 1];
                      if (newRound?.id) {
                        setExpandedRoundId(newRound.id);
                        setTimeout(() => activeRoundRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
                      }
                    } catch (err: any) {
                      setActionError(err?.message ?? "Ошибка добавления раунда");
                    }
                  }}
                >
                  + Раунд
                </Button>
                <Button
                  variant="secondary"
                  disabled={finalRoundLocked}
                  onClick={async () => {
                    if (!eventId) return;
                    const ok = await confirm({
                      title: "Добавить финальный раунд?",
                      description: "Пары будут расставлены по турнирной таблице. После добавления финального раунда новые обычные раунды создавать нельзя.",
                      confirmLabel: "Добавить",
                    });
                    if (!ok) return;
                    setInfo(null);
                    setActionError(null);
                    try {
                      console.log("[EVENT] Нажата кнопка: ФИНАЛЬНЫЙ РАУНД (addFinalRound)", eventId);
                      await api.addFinalRound(eventId);
                      const refreshed = await api.getEventDetails(eventId);
                      setData(refreshed);
                      setInfo("Финальный раунд добавлен.");
                      localStorage.setItem(`padix_final_round_${eventId}`, "1");
                      setFinalRoundLocked(true);
                      const rounds = refreshed.rounds ?? [];
                      const newRound = rounds[rounds.length - 1];
                      if (newRound?.id) {
                        setExpandedRoundId(newRound.id);
                        setTimeout(() => activeRoundRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
                      }
                    } catch (err: any) {
                      setActionError(err?.message ?? "Ошибка финального раунда");
                    }
                  }}
                >
                  Финальный раунд
                </Button>
              </div>
              <Button
                variant="destructive"
                disabled={finishing}
                onClick={async () => {
                  if (!eventId) return;
                  // Считаем матчи на игрока — для предупреждения о неравномерности.
                  const matchesPerPlayer = new Map<string, number>();
                  (data.rounds ?? []).forEach((rd) => {
                    rd.matches.forEach((mm) => {
                      if (!isMatchFinished(mm)) return;
                      [...(mm.teamA ?? []), ...(mm.teamB ?? [])].forEach((p) => {
                        if (!p?.id) return;
                        matchesPerPlayer.set(p.id, (matchesPerPlayer.get(p.id) ?? 0) + 1);
                      });
                    });
                  });
                  const counts = Array.from(matchesPerPlayer.values());
                  const minMatches = counts.length ? Math.min(...counts) : 0;
                  const maxMatches = counts.length ? Math.max(...counts) : 0;
                  const uneven = maxMatches - minMatches > 0;
                  const ok = await confirm({
                    title: "Завершить игру?",
                    description: "Игра будет завершена, рейтинги участников пересчитаны. Дальше изменить счёт нельзя.",
                    warning: (
                      <>
                        {uneven ? (
                          <div>
                            У игроков разное число сыгранных матчей (<b>{minMatches}–{maxMatches}</b>).
                            Рейтинги будут <b>нормализованы</b>: у тех, кто сыграл больше, движения слегка уменьшатся; у тех, кто меньше — увеличатся.
                          </div>
                        ) : null}
                        <div>Действие нельзя отменить.</div>
                      </>
                    ),
                    confirmLabel: "Завершить",
                    confirmVariant: "destructive",
                  });
                  if (!ok) return;
                  setFinishing(true);
                  setActionError(null);
                  setInfo(null);
                  try {
                    await api.finishEvent(eventId);
                    const refreshed = await api.getEventDetails(eventId);
                    setData(refreshed);
                    setInfo("Игра завершена. Рейтинг обновится автоматически.");
                    setRoundsOpen(false);
                  } catch (err: any) {
                    setActionError(err?.message ?? "Ошибка завершения");
                  } finally {
                    setFinishing(false);
                  }
                }}
              >
                {finishing ? "Завершаем…" : "Завершить игру"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Таблица лидеров</DialogTitle>
              {finalRoundLocked && (data.rounds?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Включает финальный раунд
                </p>
              )}
            </DialogHeader>
            {statsRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Нет данных по очкам. (Раундов: {data?.rounds?.length}, Матчей: {data?.rounds?.flatMap(r => r.matches).length})
              </div>
            ) : (
              <div className="space-y-2">
                {statsRows.map((row) => (
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
            )}
          </DialogContent>
        </Dialog>

        {/* info/actionError are now shown near the actions */}

        {editScoresOpen && eventId && data ? (
          <EditGameScoresDialog
            eventId={eventId}
            onClose={() => setEditScoresOpen(false)}
            onSave={async () => {
              setEditScoresOpen(false);
              if (eventId) {
                try {
                  const refreshed = await api.getEventDetails(eventId);
                  setData(refreshed);
                } catch {}
              }
            }}
          />
        ) : null}
      </div>
      </>
    );
  }, [
    actionError,
    canceling,
    closing,
    data,
    editScoresOpen,
    finishedMatchIds,
    finalRoundLocked,
    roundsOpen,
    statsOpen,
    statsRows,
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
    editOpen,
    editTitle,
    editDate,
    editStartTime,
    editEndTime,
    editPoints,
    editCourts,
    editPairing,
    editSaving,
    editError,
    infoExpanded,
    balanceModalOpen,
    balancePreview,
    switchingMode,
  ]);

  return <>{content}</>;
}

/**
 * Шансы выигрыша (фаза 1). Полоска expectedA vs (1-expectedA) + текстовая метка.
 * Пороги в expectedA-шкале соответствуют разнице рейтингов 50/150/300/500 (см. spec).
 */
function WinProbabilityHint({ expectedA }: { expectedA: number }) {
  const pctA = Math.round(expectedA * 100);
  const pctB = 100 - pctA;
  const absDelta = Math.abs(expectedA - 0.5);
  const favA = expectedA > 0.5;
  let label: string;
  if (absDelta < 0.07) label = "Равные шансы ⚖️";
  else if (absDelta < 0.20) label = favA ? "Лёгкий фаворит ←" : "Лёгкий фаворит →";
  else if (absDelta < 0.34) label = favA ? "Фаворит ←" : "Фаворит →";
  else if (absDelta < 0.45) label = favA ? "Сильный фаворит ←" : "Сильный фаворит →";
  else label = "Битва Давида и Голиафа 🎭";

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span>{pctA}%</span>
        <span>{label}</span>
        <span>{pctB}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40 flex">
        <div
          className="h-full bg-emerald-500/70 transition-all"
          style={{ width: `${pctA}%` }}
        />
        <div
          className="h-full bg-sky-500/60 transition-all"
          style={{ width: `${pctB}%` }}
        />
      </div>
    </div>
  );
}

function EditGameScoresDialog(props: {
  eventId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [eventData, setEventData] = useState<EventDetails | null>(null);
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
      const matches = eventData?.rounds.flatMap((r: any) => r.matches) ?? [];
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
          <button onClick={props.onClose} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded w-full">
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  const matches = eventData?.rounds.flatMap((r: any) => r.matches) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={props.onClose}>
      <ModalScrollArea
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="text-lg font-semibold">Редактирование счёта</div>
          <button onClick={props.onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
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
                      <label className="text-xs text-muted-foreground">Счёт Team A</label>
                      <input
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
                        className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                      />
                    </div>
                    <div className="text-xl font-bold mt-5">:</div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Счёт Team B</label>
                      <input
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
                        className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={props.onClose}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-border rounded-md hover:bg-secondary disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </>
        )}
      </ModalScrollArea>
    </div>
  );
}
