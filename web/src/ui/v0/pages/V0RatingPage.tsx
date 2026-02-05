import { useEffect, useMemo, useState } from "react";
import { Trophy, TrendingUp, Users } from "lucide-react";
import { api, Player } from "../../../lib/api";
import { ntrpLevel } from "../../../lib/rating";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerTooltip } from "@/components/player-tooltip";

export function V0RatingPage(props: { authed: boolean }) {
  const [data, setData] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<import("../../../lib/api").FriendsSnapshot | null>(null);

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
    if (!props.authed) return;
    api
      .getFriends()
      .then(setFriends)
      .catch(() => setFriends(null));
  }, [props.authed]);

  const content = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
    if (error)
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Не удалось загрузить: {error}
        </div>
      );
    if (!data?.length) return <div className="text-sm text-muted-foreground">Пока нет участников.</div>;

    const topPlayers = data.slice(0, 3);
    const restPlayers = data.slice(3);

    const getRankStyle = (rank: number) => {
      if (rank === 1) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      if (rank === 2) return "bg-slate-400/20 text-slate-300 border-slate-400/30";
      if (rank === 3) return "bg-orange-600/20 text-orange-400 border-orange-600/30";
      return "bg-secondary text-muted-foreground border-border";
    };

    const getRankIcon = (rank: number) => {
      if (rank <= 3) {
        return (
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${getRankStyle(rank)} border`}>
            {rank === 1 && <Trophy className="h-4 w-4" />}
            {rank === 2 && <span className="text-sm font-bold">2</span>}
            {rank === 3 && <span className="text-sm font-bold">3</span>}
          </div>
        );
      }
      return <span className="w-8 text-center text-muted-foreground">{rank}</span>;
    };

    const friendPublicIds = new Set((friends?.friends ?? []).map((f) => f.publicId));
    const outgoingPublicIds = new Set((friends?.outgoing ?? []).map((f) => f.publicId));

    return (
      <>
        <div className="grid gap-4 md:grid-cols-3">
          {topPlayers.map((player, index) => {
            const rank = index + 1;
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
                <CardContent className="relative pt-6">
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
                      <Badge variant="secondary" className="mb-2 px-3 cursor-pointer">
                        {player.name}
                      </Badge>
                    </PlayerTooltip>
                    <p className="text-3xl font-bold">{player.rating}</p>
                    <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                      <span>NTRP {ntrpLevel(player.rating)}</span>
                      <span className="text-border">|</span>
                      <span>{player.gamesPlayed} матчей</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-6 w-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Полный рейтинг
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full">
              <table className="w-full table-fixed text-sm sm:text-base">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-3 font-medium w-10">#</th>
                    <th className="pb-3 pr-3 font-medium">Игрок</th>
                    <th className="pb-3 pr-3 font-medium w-20">Рейтинг</th>
                    <th className="pb-3 pr-3 font-medium w-16 hidden sm:table-cell">NTRP</th>
                    <th className="pb-3 font-medium w-16 hidden sm:table-cell">Матчей</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {restPlayers.map((player, idx) => {
                    const rank = idx + 4;
                    return (
                      <tr key={player.id} className="group transition-colors hover:bg-secondary/50">
                        <td className="py-4 pr-3 align-middle">{getRankIcon(rank)}</td>
                        <td className="py-4 pr-3 align-middle">
                          <PlayerTooltip
                            player={{
                              id: player.id,
                              name: player.name,
                              rating: player.rating,
                              matches: player.gamesPlayed,
                              ntrp: player.ntrp,
                              odid: player.publicId,
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
                            <Badge variant="secondary" className="font-medium max-w-full truncate cursor-pointer">
                              {player.name}
                            </Badge>
                          </PlayerTooltip>
                        </td>
                        <td className="py-4 pr-3 align-middle">
                          <span className="font-semibold tabular-nums">{player.rating}</span>
                        </td>
                        <td className="py-4 pr-3 text-muted-foreground align-middle hidden sm:table-cell">{ntrpLevel(player.rating)}</td>
                        <td className="py-4 text-muted-foreground align-middle hidden sm:table-cell">{player.gamesPlayed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }, [data, error, loading]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Рейтинг</h1>
          <p className="mt-1 text-muted-foreground">Таблица лидеров падел-игроков</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{data?.length ?? 0} игроков</span>
          </div>
        </div>
      </div>

      {content}
    </div>
  );
}

