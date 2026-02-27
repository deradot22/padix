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
import { PlayerTooltip } from "@/components/player-tooltip";

const NTRP_LEVELS = ["1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0+"];

const NTRP_COLORS: Record<string, string> = {
  "1.0": "text-zinc-400",
  "1.5": "text-zinc-400",
  "2.0": "text-emerald-400",
  "2.5": "text-emerald-400",
  "3.0": "text-sky-400",
  "3.5": "text-sky-400",
  "4.0": "text-violet-400",
  "4.5": "text-amber-400",
  "5.0+": "text-rose-400",
};

export function V0RatingPage(props: { authed: boolean; me?: { playerId?: string } | null }) {
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
    return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
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
  const playersAboveMe = showMyRowSeparately && myRank != null && myRank > 2
    ? basePlayers.slice(Math.max(0, myRank - 3), myRank - 1)
    : [];
  const playersBelowMe = showMyRowSeparately && myRank != null && myRank < basePlayers.length
    ? basePlayers.slice(myRank, Math.min(basePlayers.length, myRank + 2))
    : [];

  const scrollToMe = () => myRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (rank === 2) return "bg-slate-400/20 text-slate-300 border-slate-400/30";
    if (rank === 3) return "bg-orange-600/20 text-orange-400 border-orange-600/30";
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
    if (!player.publicId) throw new Error("Не удалось определить публичный ID");
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
    return "Заявка отправлена";
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
              rating: player.rating,
              matches: player.gamesPlayed,
              ntrp: player.ntrp,
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
          <span className="font-semibold tabular-nums text-sm sm:text-base">
            {isCalibrating(player) && isMe ? "—" : player.rating}
          </span>
          {isCalibrating(player) && !isMe && (
            <span className="text-amber-500/80 ml-0.5" title="В калибровке">?</span>
          )}
        </td>
        <td className="py-1.5 sm:py-2 pl-2 pr-4 sm:pl-3 sm:pr-6 align-middle text-right whitespace-nowrap">
          <span className={cn("tabular-nums text-xs sm:text-sm font-medium", ntrpColor)}>
            {isCalibrating(player) && isMe ? "—" : ntrp}
          </span>
        </td>
        <td className="py-1.5 sm:py-2 pl-2 pr-3 text-muted-foreground align-middle text-right tabular-nums text-xs sm:text-sm hidden sm:table-cell">
          {player.gamesPlayed}
        </td>
      </tr>
    );
  };

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
                rating: player.rating,
                matches: player.gamesPlayed,
                ntrp: player.ntrp,
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
            <p className={cn("font-bold tabular-nums", isFirst ? "text-2xl sm:text-4xl" : "text-xl sm:text-3xl")}>
              {isCalibrating(player) && player.id === meId ? "—" : player.rating}
            </p>
            <div className="mt-1 sm:mt-2 flex flex-col sm:flex-row items-center gap-0.5 sm:gap-3 text-[10px] sm:text-sm text-muted-foreground">
              <span className={NTRP_COLORS[ntrpLevel(player.rating)] ?? ""}>
                NTRP {isCalibrating(player) && player.id === meId ? "—" : ntrpLevel(player.rating)}
              </span>
              <span className="text-border hidden sm:inline">|</span>
              <span className="flex items-center gap-1">
                <Gamepad2 className="h-3 w-3 sm:hidden" />
                <span className="hidden sm:inline">{player.gamesPlayed} матчей</span>
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
  }, [hasData, topPlayersLocal, globalRankMap, meId, friends, props.authed]);

  const activeFiltersCount = [calibrationFilter !== "calibrated", ntrpMin, ntrpMax].filter(Boolean).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Рейтинг</h1>
          <p className="mt-0.5 sm:mt-1 text-sm sm:text-base text-muted-foreground">Таблица лидеров падел-игроков</p>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{ratingStats.calibrated} откалибровано</span>
          </div>
          {ratingStats.notCalibrated > 0 && (
            <div className="flex items-center gap-1.5">
              <span>{ratingStats.notCalibrated} в калибровке</span>
            </div>
          )}
        </div>
      </div>

      {topCards}

      {hasData && (
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 shrink-0"
                  onClick={() => setFilterOpen((o) => !o)}
                >
                  <Filter className="h-4 w-4" />
                  Фильтр
                  {activeFiltersCount > 0 && (
                    <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {activeFiltersCount}
                    </span>
                  )}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", filterOpen && "rotate-180")} />
                </Button>
                {meId && myRank !== null && myRank > topCount && (
                  <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={scrollToMe}>
                    К моему рейтингу (#{myRank})
                  </Button>
                )}
              </div>
              {filterOpen && (
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 rounded-lg border border-border bg-secondary/30 p-2.5 sm:p-3 w-fit max-w-full">
                  <Select value={calibrationFilter} onValueChange={(v: any) => setCalibrationFilter(v)}>
                    <SelectTrigger className="h-9 w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calibrated">Только откалиброванные</SelectItem>
                      <SelectItem value="in_calibration">В калибровке</SelectItem>
                      <SelectItem value="all">Все</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs shrink-0">NTRP</span>
                    <Select value={ntrpMin || "min"} onValueChange={(v) => setNtrpMin(v === "min" ? "" : v)}>
                      <SelectTrigger className="h-9 w-[88px] sm:w-[100px]">
                        <SelectValue placeholder="от" />
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
                        <SelectValue placeholder="до" />
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
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-muted-foreground py-8 text-center">Загрузка…</div>}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Не удалось загрузить: {error}
        </div>
      )}
      {!loading && !error && !hasData && (
        <div className="text-sm text-muted-foreground py-8 text-center">Пока нет участников.</div>
      )}

      {hasData && (
        <Card className="w-full">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Полный рейтинг
              </CardTitle>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {filteredPlayers.length} игроков
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs sm:text-sm">
                    <th className="py-2 pl-2 sm:pl-3 pr-1 font-medium text-center w-10 sm:w-12">#</th>
                    <th className="py-2 pr-1 sm:pr-2 font-medium text-left">Игрок</th>
                    <th className="py-2 px-2 sm:px-3 font-medium text-center w-[22%] sm:w-[18%]">Рейтинг</th>
                    <th className="py-2 pl-2 pr-4 sm:pl-3 sm:pr-6 font-medium text-right w-[18%] sm:w-[14%]">NTRP</th>
                    <th className="py-2 pl-2 pr-3 font-medium text-right hidden sm:table-cell w-[12%]">Матчей</th>
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
                          Вы здесь
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
