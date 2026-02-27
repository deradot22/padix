import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, Search, Trophy, TrendingUp, Users } from "lucide-react";
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

  // Базовый список (только калибровочный фильтр, без поиска/NTRP), для вычисления глобального ранга
  const basePlayers = useMemo(() => {
    let list = (data ?? []).filter((p) => !p.name.startsWith("Удалённый пользователь") && (p.rating ?? 0) > 0);
    if (calibrationFilter === "calibrated") list = list.filter((p) => (p.calibrationEventsRemaining ?? 0) === 0);
    else if (calibrationFilter === "in_calibration") list = list.filter((p) => (p.calibrationEventsRemaining ?? 0) > 0);
    return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [data, calibrationFilter]);

  // Глобальный ранг каждого игрока (id → rank)
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
    <div className={`flex h-7 w-7 min-w-7 shrink-0 items-center justify-center rounded-full border tabular-nums text-xs ${getRankStyle(rank)}`}>
      {rank === 1 ? <Trophy className="h-3.5 w-3.5 shrink-0" /> : <span className="font-bold">{rank}</span>}
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

  const renderPlayerRow = (player: Player, rank: number, isMe?: boolean) => (
    <tr
      key={player.id}
      ref={isMe ? myRowRef : undefined}
      className={`group transition-colors hover:bg-secondary/50 ${isMe ? "bg-primary/10 shadow-[inset_4px_0_0_0_var(--primary)]" : ""}`}
    >
      <td className="py-2 pl-2 pr-1 align-middle w-9">
        <div className="flex justify-center">{getRankIcon(rank)}</div>
      </td>
      <td className="py-2 pr-2 align-middle min-w-0 max-w-[180px] overflow-hidden">
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
          addFriendStatus={
            !player.publicId
              ? "none"
              : friendPublicIds.has(player.publicId)
                ? "friend"
                : outgoingPublicIds.has(player.publicId)
                  ? "requested"
                  : "none"
          }
          onAddFriend={async () => {
            if (!player.publicId) throw new Error("Не удалось определить публичный ID");
            const publicId = player.publicId;
            await api.requestFriend(publicId);
            if (publicId) {
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
            }
            return "Заявка отправлена";
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-xs font-semibold border border-border overflow-hidden">
              {player.avatarUrl ? (
                <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(player.name) || "?"
              )}
            </div>
            <Badge variant="secondary" className="font-medium min-w-0 max-w-full truncate cursor-pointer">
              {player.name}
            </Badge>
          </div>
        </PlayerTooltip>
      </td>
      <td className="py-2 pl-2 pr-2 align-middle whitespace-nowrap text-right w-14">
        <span className="font-semibold tabular-nums">
          {(player.calibrationEventsRemaining ?? 0) > 0 && isMe ? "—" : player.rating}
        </span>
        {(player.calibrationEventsRemaining ?? 0) > 0 && !isMe ? (
          <span className="text-amber-500/80 ml-1" title="В калибровке">?</span>
        ) : null}
      </td>
      <td className="py-2 pl-1 pr-2 text-muted-foreground align-middle text-right w-12 hidden sm:table-cell">
        {(player.calibrationEventsRemaining ?? 0) > 0 && isMe ? "—" : ntrpLevel(player.rating)}
      </td>
      <td className="py-2 pl-1 pr-2 text-muted-foreground align-middle text-right w-10 hidden sm:table-cell tabular-nums">{player.gamesPlayed}</td>
    </tr>
  );

  const hasData = !loading && !error && (filteredPlayers?.length ?? 0) > 0;
  const topPlayersLocal = hasData ? filteredPlayers.slice(0, 3) : [];

  const topCards = useMemo(() => {
    if (!hasData || !topPlayersLocal.length) return null;
    return (
      <div className="grid gap-4 md:grid-cols-3">
          {topPlayersLocal.map((player, index) => {
            const rank = globalRankMap.get(player.id) ?? (index + 1);
            return (
              <Card
                key={player.id}
                className={`relative overflow-hidden ${
                  index === 0 ? "md:order-2" : index === 1 ? "md:order-1" : "md:order-3"
                }`}
              >
                <div
                  className={`absolute inset-0 opacity-5 ${
                    rank === 1 ? "bg-amber-500" : rank === 2 ? "bg-slate-400" : "bg-orange-600"
                  }`}
                />
                <CardContent className="relative pt-8">
                  <div className="flex flex-col items-center text-center">
                    <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 ${getRankStyle(rank)}`}>
                      {rank === 1 ? <Trophy className="h-8 w-8" /> : <span className="text-2xl font-bold">{rank}</span>}
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
                      addFriendStatus={
                        !player.publicId
                          ? "none"
                          : friendPublicIds.has(player.publicId)
                            ? "friend"
                            : outgoingPublicIds.has(player.publicId)
                              ? "requested"
                              : "none"
                      }
                      onAddFriend={async () => {
                        if (!player.publicId) throw new Error("Не удалось определить публичный ID");
                        await api.requestFriend(player.publicId);
                        setFriends((prev) =>
                          prev
                            ? {
                                ...prev,
                                outgoing: prev.outgoing.some((o) => o.publicId === player.publicId)
                                  ? prev.outgoing
                                  : [...prev.outgoing, { publicId: player.publicId!, name: player.name }],
                              }
                            : prev,
                        );
                        return "Заявка отправлена";
                      }}
                    >
                      <div className="mb-3 flex w-full items-center justify-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/60 text-sm font-semibold border border-border overflow-hidden">
                          {player.avatarUrl ? (
                            <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials(player.name) || "?"
                          )}
                        </div>
                        <Badge variant="secondary" className="px-4 py-1.5 text-lg font-semibold cursor-pointer max-w-full truncate">
                          {player.name}
                        </Badge>
                      </div>
                    </PlayerTooltip>
                    <p className="text-3xl font-bold">
                      {(player.calibrationEventsRemaining ?? 0) > 0 && player.id === meId ? "—" : player.rating}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        NTRP {(player.calibrationEventsRemaining ?? 0) > 0 && player.id === meId ? "—" : ntrpLevel(player.rating)}
                      </span>
                      <span className="text-border">|</span>
                      <span>{player.gamesPlayed} матчей</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    );
  }, [hasData, topPlayersLocal, globalRankMap, meId, friends, props.authed]);

  const fullRatingCard = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground py-8">Загрузка…</div>;
    if (error)
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Не удалось загрузить: {error}
        </div>
      );
    if (!hasData) return <div className="text-sm text-muted-foreground py-8">Пока нет участников.</div>;

    return (
        <Card className="w-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Полный рейтинг
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="overflow-x-auto -mx-1">
              <table className="text-sm table-auto w-fit max-w-full">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pl-2 pr-1 font-medium text-center w-9">#</th>
                    <th className="py-2 pr-2 font-medium text-left">Игрок</th>
                    <th className="py-2 pl-2 pr-2 font-medium text-right whitespace-nowrap w-14">Рейтинг</th>
                    <th className="py-2 pl-1 pr-2 font-medium text-right whitespace-nowrap w-12 hidden sm:table-cell">NTRP</th>
                    <th className="py-2 pl-1 pr-2 font-medium text-right whitespace-nowrap w-10 hidden sm:table-cell">Матчей</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topPlayers.map((player) =>
                    renderPlayerRow(player, globalRankMap.get(player.id) ?? 0, player.id === meId)
                  )}
                  {showMyRowSeparately && myPlayer && (
                    <>
                      <tr>
                        <td colSpan={5} className="py-5">
                          <div className="-mx-16 border-t border-primary/40" />
                        </td>
                      </tr>
                      {playersAboveMe.map((player) =>
                        renderPlayerRow(player, globalRankMap.get(player.id) ?? 0, false)
                      )}
                      <tr className="bg-primary/5">
                        <td colSpan={5} className="py-2 text-center text-xs font-medium text-primary">
                          Вы здесь
                        </td>
                      </tr>
                      {renderPlayerRow(myPlayer, myRank!, true)}
                      {playersBelowMe.map((player) =>
                        renderPlayerRow(player, globalRankMap.get(player.id) ?? 0, false)
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
    );
  }, [
    loading,
    error,
    hasData,
    topPlayers,
    showMyRowSeparately,
    myPlayer,
    myRank,
    playersAboveMe,
    playersBelowMe,
    meId,
    friends,
    props.authed,
    globalRankMap,
  ]);

  const activeFiltersCount = [calibrationFilter !== "calibrated", ntrpMin, ntrpMax].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Рейтинг</h1>
          <p className="mt-1 text-muted-foreground">Таблица лидеров падел-игроков</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{ratingStats.calibrated} откалибровано</span>
          </div>
          {ratingStats.notCalibrated > 0 ? (
            <div className="flex items-center gap-2">
              <span>{ratingStats.notCalibrated} в калибровке</span>
            </div>
          ) : null}
        </div>
      </div>

      {topCards}

      {hasData && (
        <div className="flex flex-col gap-3">
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
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
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
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
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

      {fullRatingCard}
    </div>
  );
}
