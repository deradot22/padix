import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, Gamepad2, Search, Trophy, TrendingUp, Users } from "lucide-react";
import { api, hasToken, Player } from "../../../lib/api";
import { ntrpLevel } from "../../../lib/rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Dict, useI18n, plural } from "@/lib/i18n";
import { PlayerTooltip } from "@/components/player-tooltip";

const TR = {
  "header.title": { ru: "Рейтинг", en: "Rating" },
  "header.subtitle": { ru: "Таблица лидеров падел-игроков", en: "Padel players leaderboard" },
  "stats.calibrated": { ru: "{n} откалибровано", en: "{n} calibrated" },
  "stats.inCalibration": { ru: "{n} в калибровке", en: "{n} in calibration" },
  "search.placeholder": { ru: "Поиск по имени...", en: "Search by name..." },
  "filter.button": { ru: "Фильтр", en: "Filter" },
  "filter.calibratedOnly": { ru: "Только откалиброванные", en: "Calibrated only" },
  "filter.inCalibration": { ru: "В калибровке", en: "In calibration" },
  "filter.all": { ru: "Все", en: "All" },
  "filter.from": { ru: "от", en: "from" },
  "filter.to": { ru: "до", en: "to" },
  "toMyRank": { ru: "К моему рейтингу (#{rank})", en: "To my rank (#{rank})" },
  "common.loading": { ru: "Загрузка…", en: "Loading…" },
  "error.loadFallback": { ru: "Ошибка загрузки", en: "Failed to load" },
  "loadFailed": { ru: "Не удалось загрузить: {error}", en: "Failed to load: {error}" },
  "empty.filtered": {
    ru: "По выбранному фильтру нет игроков. Попробуйте изменить условия.",
    en: "No players match the filter. Try changing it.",
  },
  "empty.none": { ru: "Пока нет участников.", en: "No players yet." },
  "table.title": { ru: "Полный рейтинг", en: "Full rating" },
  "table.player": { ru: "Игрок", en: "Player" },
  "table.rating": { ru: "Рейтинг", en: "Rating" },
  "table.matches": { ru: "Матчей", en: "Matches" },
  "table.youAreHere": { ru: "Вы здесь", en: "You are here" },
  "hint.ratingHidden": {
    ru: "Рейтинг скрыт — не играл больше полугода",
    en: "Rating hidden — no games for over six months",
  },
  "hint.inCalibration": { ru: "В калибровке", en: "In calibration" },
  "friend.requestSent": { ru: "Заявка отправлена", en: "Request sent" },
  "friend.noPublicId": { ru: "Не удалось определить публичный ID", en: "Couldn't determine public ID" },
} satisfies Dict;

const NTRP_LEVELS = ["1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0+"];

const NTRP_COLORS: Record<string, string> = {
  "1.0": "text-zinc-600 dark:text-zinc-400",
  "1.5": "text-zinc-600 dark:text-zinc-400",
  "2.0": "text-emerald-700 dark:text-emerald-400",
  "2.5": "text-emerald-700 dark:text-emerald-400",
  "3.0": "text-sky-700 dark:text-sky-400",
  "3.5": "text-sky-700 dark:text-sky-400",
  "4.0": "text-violet-700 dark:text-violet-400",
  "4.5": "text-amber-700 dark:text-amber-400",
  "5.0+": "text-rose-700 dark:text-rose-400",
};

export function V0RatingPage(props: { authed: boolean; me?: { playerId?: string } | null }) {
  const { t, lang } = useI18n(TR);
  const [data, setData] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<import("../../../lib/api").FriendsSnapshot | null>(null);
  const [search, setSearch] = useState("");
  const [calibrationFilter, setCalibrationFilter] = useState<"all" | "calibrated" | "in_calibration">("calibrated");
  const [ntrpMin, setNtrpMin] = useState<string>("");
  const [ntrpMax, setNtrpMax] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  const myRowRef = useRef<HTMLTableRowElement | null>(null);
  const meId = props.me?.playerId;

  const ratingStats = useMemo(() => {
    const list = (data ?? []).filter((p) => !p.name.startsWith("Удалённый пользователь"));
    const calibrated = list.filter((p) => (p.calibrationEventsRemaining ?? 0) === 0).length;
    const notCalibrated = list.filter((p) => (p.calibrationEventsRemaining ?? 0) > 0).length;
    return { calibrated, notCalibrated, total: list.length };
  }, [data]);

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
        setError(e instanceof Error ? e.message : t("error.loadFallback"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!props.authed || !hasToken()) return;
    let cancelled = false;
    api
      .getFriends()
      .then((f) => { if (!cancelled) setFriends(f); })
      .catch(() => { if (!cancelled) setFriends(null); });
    return () => { cancelled = true; };
  }, [props.authed]);

  const basePlayers = useMemo(() => {
    let list = (data ?? []).filter((p) => !p.name.startsWith("Удалённый пользователь") && (p.rating ?? 0) > 0);
    if (calibrationFilter === "calibrated") list = list.filter((p) => (p.calibrationEventsRemaining ?? 0) === 0);
    else if (calibrationFilter === "in_calibration") list = list.filter((p) => (p.calibrationEventsRemaining ?? 0) > 0);
    // Скрытые рейтинги (полгода без игр) — в конец списка, чтобы позиция не выдавала число.
    return list.sort(
      (a, b) => Number(a.ratingHidden ?? false) - Number(b.ratingHidden ?? false) || (b.rating ?? 0) - (a.rating ?? 0)
    );
  }, [data, calibrationFilter]);

  const globalRankMap = useMemo(() => {
    const map = new Map<string, number>();
    basePlayers.forEach((p, idx) => map.set(p.id, idx + 1));
    return map;
  }, [basePlayers]);

  const filteredPlayers = useMemo(() => {
    let list = basePlayers;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (ntrpMin) {
      const idx = NTRP_LEVELS.indexOf(ntrpMin);
      list = list.filter((p) => NTRP_LEVELS.indexOf(ntrpLevel(p.rating)) >= idx);
    }
    if (ntrpMax) {
      const idx = NTRP_LEVELS.indexOf(ntrpMax);
      list = list.filter((p) => NTRP_LEVELS.indexOf(ntrpLevel(p.rating)) <= idx);
    }
    return list;
  }, [basePlayers, search, ntrpMin, ntrpMax]);

  const myRank = useMemo(() => {
    if (!meId) return null;
    return globalRankMap.get(meId) ?? null;
  }, [globalRankMap, meId]);

  const isSearchActive = !!(search.trim() || ntrpMin || ntrpMax);
  const topCount = 10;
  const topPlayers = filteredPlayers.slice(0, topCount);
  const showMyRowSeparately = !isSearchActive && meId && myRank !== null && myRank > topCount;
  const myPlayer = showMyRowSeparately ? basePlayers.find((p) => p.id === meId) : null;
  // Игроки прямо над «Вы здесь». Пропускаем тех, кто уже показан в топ-N,
  // иначе при myRank = topCount + 1..topCount + 2 строки 9/10 дублировались.
  const playersAboveMe = showMyRowSeparately && myRank != null && myRank > 2
    ? basePlayers.slice(Math.max(topCount, myRank - 3), myRank - 1)
    : [];
  const playersBelowMe = showMyRowSeparately && myRank != null && myRank < basePlayers.length
    ? basePlayers.slice(myRank, Math.min(basePlayers.length, myRank + 2))
    : [];

  const scrollToMe = () => myRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40 dark:border-amber-500/30";
    if (rank === 2) return "bg-slate-400/20 text-slate-700 dark:text-slate-300 border-slate-400/50 dark:border-slate-400/30";
    if (rank === 3) return "bg-orange-600/20 text-orange-700 dark:text-orange-400 border-orange-600/40 dark:border-orange-600/30";
    return "bg-secondary text-muted-foreground border-border";
  };

  const getRankIcon = (rank: number) => (
    <div className={cn(
      "flex items-center justify-center rounded-full border tabular-nums text-xs font-bold shrink-0",
      "h-6 w-6 min-w-6 sm:h-7 sm:w-7 sm:min-w-7",
      getRankStyle(rank),
    )}>
      {rank === 1 ? <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" /> : rank}
    </div>
  );

  const friendPublicIds = new Set((friends?.friends ?? []).map((f) => f.publicId));
  const outgoingPublicIds = new Set((friends?.outgoing ?? []).map((f) => f.publicId));

  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");

  const addFriendHandler = (player: Player) => async () => {
    if (!player.publicId) throw new Error(t("friend.noPublicId"));
    const publicId = player.publicId;
    await api.requestFriend(publicId);
    setFriends((prev) =>
      prev
        ? {
            ...prev,
            outgoing: prev.outgoing.some((o) => o.publicId === publicId)
              ? prev.outgoing
              : [...prev.outgoing, { publicId, name: player.name }],
          }
        : prev,
    );
    return t("friend.requestSent");
  };

  const friendStatus = (player: Player) =>
    !player.publicId
      ? "none" as const
      : friendPublicIds.has(player.publicId)
        ? "friend" as const
        : outgoingPublicIds.has(player.publicId)
          ? "requested" as const
          : "none" as const;

  const isCalibrating = (player: Player) => (player.calibrationEventsRemaining ?? 0) > 0;

  const renderPlayerRow = (player: Player, rank: number, isMe: boolean, index: number) => {
    const ntrp = ntrpLevel(player.rating);
    const ntrpColor = NTRP_COLORS[ntrp] ?? "text-muted-foreground";
    const isTop3 = rank <= 3;

    return (
      <tr
        key={player.id}
        ref={isMe ? myRowRef : undefined}
        className={cn(
          "transition-colors hover:bg-secondary/50",
          isMe && "bg-primary/10 shadow-[inset_3px_0_0_0_hsl(var(--primary))]",
          !isMe && index % 2 === 1 && "bg-secondary/20",
          isTop3 && !isMe && "bg-gradient-to-r from-amber-500/[0.03] to-transparent",
        )}
      >
        <td className="py-1.5 sm:py-2 pl-2 pr-1 align-middle">
          <div className="flex justify-center">{getRankIcon(rank)}</div>
        </td>
        <td className="py-1.5 sm:py-2 pr-1 sm:pr-2 align-middle min-w-0">
          <PlayerTooltip
            player={{
              id: player.id,
              name: player.name,
              rating: player.ratingHidden ? null : player.rating,
              matches: player.gamesPlayed,
              ntrp: player.ratingHidden ? undefined : player.ntrp,
              odid: player.publicId,
              avatarUrl: player.avatarUrl,
            }}
            showAddFriend={props.authed}
            addFriendStatus={friendStatus(player)}
            onAddFriend={addFriendHandler(player)}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-[10px] sm:text-xs font-semibold border border-border overflow-hidden">
                {player.avatarUrl ? (
                  <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(player.name) || "?"
                )}
              </div>
              <span className="font-medium text-xs sm:text-sm truncate cursor-pointer min-w-0">
                {player.name}
              </span>
            </div>
          </PlayerTooltip>
        </td>
        <td className="py-1.5 sm:py-2 px-2 sm:px-3 align-middle whitespace-nowrap text-center">
          <span className="font-display font-bold tabular-nums text-base sm:text-xl">
            {player.ratingHidden || (isCalibrating(player) && isMe) ? "—" : player.rating}
          </span>
          {player.ratingHidden ? (
            <span className="text-muted-foreground ml-0.5" title={t("hint.ratingHidden")}>?</span>
          ) : (
            isCalibrating(player) && !isMe && (
              <span className="text-amber-600 dark:text-amber-500/80 ml-0.5" title={t("hint.inCalibration")}>?</span>
            )
          )}
        </td>
        <td className="py-1.5 sm:py-2 pl-2 pr-4 sm:pl-3 sm:pr-6 align-middle text-right whitespace-nowrap">
          <span className={cn("tabular-nums text-xs sm:text-sm font-medium", ntrpColor)}>
            {player.ratingHidden || (isCalibrating(player) && isMe) ? "—" : ntrp}
          </span>
        </td>
        <td className="py-1.5 sm:py-2 pl-2 pr-3 text-muted-foreground align-middle text-right tabular-nums text-xs sm:text-sm hidden sm:table-cell">
          {player.gamesPlayed}
        </td>
      </tr>
    );
  };

  const hasAnyPlayer = !loading && !error && (data?.length ?? 0) > 0;
  const hasData = !loading && !error && (filteredPlayers?.length ?? 0) > 0;
  const topPlayersLocal = hasData ? filteredPlayers.slice(0, 3) : [];

  const renderTopCard = (player: Player, rank: number) => {
    const isFirst = rank === 1;
    const isThird = rank === 3;
    return (
      <Card
        key={player.id}
        className={cn(
          "relative overflow-hidden",
          isFirst && "ring-1 ring-amber-500/20",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 opacity-5",
            rank === 1 ? "bg-amber-500" : rank === 2 ? "bg-slate-400" : "bg-orange-600",
          )}
        />
        <CardContent className={cn(
          "relative px-2 sm:px-6",
          isFirst && "pt-6 sm:pt-10 pb-6 sm:pb-8",
          rank === 2 && "pt-4 sm:pt-6 pb-4 sm:pb-5",
          isThird && "pt-2 sm:pt-3 pb-2 sm:pb-3",
        )}>
          <div className="flex flex-col items-center text-center">
            <div className={cn(
              "mb-2 sm:mb-4 flex items-center justify-center rounded-full border-2",
              isFirst ? "h-12 w-12 sm:h-18 sm:w-18" : "h-10 w-10 sm:h-14 sm:w-14",
              getRankStyle(rank),
            )}>
              {isFirst
                ? <Trophy className="h-6 w-6 sm:h-9 sm:w-9" />
                : <span className="text-lg sm:text-2xl font-bold">{rank}</span>
              }
            </div>
            <PlayerTooltip
              player={{
                id: player.id,
                name: player.name,
                rating: player.ratingHidden ? null : player.rating,
                matches: player.gamesPlayed,
                ntrp: player.ratingHidden ? undefined : player.ntrp,
                odid: player.publicId,
                avatarUrl: player.avatarUrl,
              }}
              showAddFriend={props.authed}
              addFriendStatus={friendStatus(player)}
              onAddFriend={addFriendHandler(player)}
            >
              <div className="mb-2 sm:mb-3 flex w-full items-center justify-center gap-1.5 sm:gap-3">
                <div className={cn(
                  "flex items-center justify-center rounded-full bg-secondary/60 font-semibold border border-border overflow-hidden shrink-0",
                  isFirst ? "h-7 w-7 sm:h-10 sm:w-10 text-[10px] sm:text-sm" : "h-6 w-6 sm:h-8 sm:w-8 text-[10px] sm:text-xs",
                )}>
                  {player.avatarUrl ? (
                    <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(player.name) || "?"
                  )}
                </div>
                <span className={cn(
                  "font-semibold cursor-pointer truncate min-w-0",
                  isFirst ? "text-xs sm:text-lg" : "text-[11px] sm:text-base",
                )}>
                  {player.name}
                </span>
              </div>
            </PlayerTooltip>
            <p className={cn("font-display font-bold tabular-nums leading-none", isFirst ? "text-3xl sm:text-5xl" : "text-2xl sm:text-4xl")}>
              {player.ratingHidden || (isCalibrating(player) && player.id === meId) ? "—" : player.rating}
            </p>
            <div className="mt-1 sm:mt-2 flex flex-col sm:flex-row items-center gap-0.5 sm:gap-3 text-[10px] sm:text-sm text-muted-foreground">
              <span className={player.ratingHidden ? "" : NTRP_COLORS[ntrpLevel(player.rating)] ?? ""}>
                NTRP {player.ratingHidden || (isCalibrating(player) && player.id === meId) ? "—" : ntrpLevel(player.rating)}
              </span>
              <span className="text-border hidden sm:inline">|</span>
              <span className="flex items-center gap-1">
                <Gamepad2 className="h-3 w-3 sm:hidden" />
                <span className="hidden sm:inline">
                  {player.gamesPlayed} {plural(lang, player.gamesPlayed, ["матч", "матча", "матчей"], ["match", "matches"])}
                </span>
                <span className="sm:hidden">{player.gamesPlayed}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const topCards = useMemo(() => {
    if (!hasData || topPlayersLocal.length < 3) return null;
    const [p1, p2, p3] = topPlayersLocal;
    const r1 = globalRankMap.get(p1.id) ?? 1;
    const r2 = globalRankMap.get(p2.id) ?? 2;
    const r3 = globalRankMap.get(p3.id) ?? 3;
    return (
      <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
        <div>{renderTopCard(p2, r2)}</div>
        <div>{renderTopCard(p1, r1)}</div>
        <div>{renderTopCard(p3, r3)}</div>
      </div>
    );
  }, [hasData, topPlayersLocal, globalRankMap, meId, friends, props.authed, lang, t]);

  const activeFiltersCount = [calibrationFilter !== "calibrated", ntrpMin, ntrpMax].filter(Boolean).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("header.title")}</h1>
          <p className="mt-0.5 sm:mt-1 text-sm sm:text-base text-muted-foreground">{t("header.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{t("stats.calibrated", { n: ratingStats.calibrated })}</span>
          </div>
          {ratingStats.notCalibrated > 0 && (
            <div className="flex items-center gap-1.5">
              <span>{t("stats.inCalibration", { n: ratingStats.notCalibrated })}</span>
            </div>
          )}
        </div>
      </div>

      {topCards}

      {hasAnyPlayer && (
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("search.placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 shrink-0"
              onClick={() => setFilterOpen((o) => !o)}
            >
              <Filter className="h-4 w-4" />
              {t("filter.button")}
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={cn("h-4 w-4 transition-transform", filterOpen && "rotate-180")} />
            </Button>
            {meId && myRank !== null && myRank > topCount && (
              <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={scrollToMe}>
                {t("toMyRank", { rank: myRank })}
              </Button>
            )}
          </div>
          {filterOpen && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 rounded-lg border border-border bg-secondary/30 p-2.5 sm:p-3">
              <Select value={calibrationFilter} onValueChange={(v: any) => setCalibrationFilter(v)}>
                <SelectTrigger className="h-9 w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calibrated">{t("filter.calibratedOnly")}</SelectItem>
                  <SelectItem value="in_calibration">{t("filter.inCalibration")}</SelectItem>
                  <SelectItem value="all">{t("filter.all")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs shrink-0">NTRP</span>
                <Select value={ntrpMin || "min"} onValueChange={(v) => setNtrpMin(v === "min" ? "" : v)}>
                  <SelectTrigger className="h-9 w-[88px] sm:w-[100px]">
                    <SelectValue placeholder={t("filter.from")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="min">—</SelectItem>
                    {NTRP_LEVELS.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-xs shrink-0">–</span>
                <Select value={ntrpMax || "max"} onValueChange={(v) => setNtrpMax(v === "max" ? "" : v)}>
                  <SelectTrigger className="h-9 w-[88px] sm:w-[100px]">
                    <SelectValue placeholder={t("filter.to")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="max">—</SelectItem>
                    {NTRP_LEVELS.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-sm text-muted-foreground py-8 text-center">{t("common.loading")}</div>}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          {t("loadFailed", { error })}
        </div>
      )}
      {!loading && !error && !hasData && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {hasAnyPlayer ? t("empty.filtered") : t("empty.none")}
        </div>
      )}

      {hasData && (
        <Card className="w-full">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                {t("table.title")}
              </CardTitle>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {filteredPlayers.length} {plural(lang, filteredPlayers.length, ["игрок", "игрока", "игроков"], ["player", "players"])}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs sm:text-sm">
                    <th className="py-2 pl-2 sm:pl-3 pr-1 font-medium text-center w-10 sm:w-12">#</th>
                    <th className="py-2 pr-1 sm:pr-2 font-medium text-left">{t("table.player")}</th>
                    <th className="py-2 px-2 sm:px-3 font-medium text-center w-[22%] sm:w-[18%]">{t("table.rating")}</th>
                    <th className="py-2 pl-2 pr-4 sm:pl-3 sm:pr-6 font-medium text-right w-[18%] sm:w-[14%]">NTRP</th>
                    <th className="py-2 pl-2 pr-3 font-medium text-right hidden sm:table-cell w-[12%]">{t("table.matches")}</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlayers.map((player, idx) =>
                    renderPlayerRow(player, globalRankMap.get(player.id) ?? (idx + 1), player.id === meId, idx)
                  )}
                  {showMyRowSeparately && myPlayer && (
                    <>
                      <tr>
                        <td colSpan={5} className="py-3 sm:py-4">
                          <div className="border-t border-dashed border-primary/30" />
                        </td>
                      </tr>
                      {playersAboveMe.map((player, idx) =>
                        renderPlayerRow(player, globalRankMap.get(player.id) ?? 0, false, topCount + idx)
                      )}
                      <tr className="bg-primary/5">
                        <td colSpan={5} className="py-1.5 text-center text-[11px] sm:text-xs font-medium text-primary">
                          {t("table.youAreHere")}
                        </td>
                      </tr>
                      {renderPlayerRow(myPlayer, myRank!, true, topCount + playersAboveMe.length)}
                      {playersBelowMe.map((player, idx) =>
                        renderPlayerRow(player, globalRankMap.get(player.id) ?? 0, false, topCount + playersAboveMe.length + 1 + idx)
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
