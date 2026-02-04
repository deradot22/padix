import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Calendar, Clock, Gamepad2, TrendingUp, Trophy, Users, Zap } from "lucide-react";
import { api, Event, Player } from "../../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventDate, timeRange } from "../utils";

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatLabel(format: Event["format"]) {
  switch (format) {
    case "AMERICANA":
      return "Американка";
    default:
      return format;
  }
}

export function V0HomePage(props: { me: any }) {
  const nav = useNavigate();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [rating, setRating] = useState<Player[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [registeredIds, setRegisteredIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (props.me && !props.me.surveyCompleted) return;
    setLoading(true);
    const ratingReq = api.getRating();
    const eventsReq = props.me
      ? (() => {
          const now = new Date();
          const from = formatDate(now);
          const to = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
          return api.getUpcomingEvents(from, to);
        })()
      : Promise.resolve([] as Event[]);

    Promise.all([eventsReq, ratingReq])
      .then(([e, r]) => {
        setEvents(e ?? []);
        setRating(r ?? []);
      })
      .catch(() => {
        setEvents([]);
        setRating([]);
      })
      .finally(() => setLoading(false));
  }, [props.me]);

  useEffect(() => {
    if (!props.me?.playerId) {
      setRegisteredIds({});
      return;
    }
    const upcomingIds = (events ?? []).slice(0, 2).map((e) => e.id);
    if (upcomingIds.length === 0) {
      setRegisteredIds({});
      return;
    }
    let cancelled = false;
    Promise.all(upcomingIds.map((id) => api.getEventDetails(id)))
      .then((details) => {
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        details.forEach((d) => {
          const meId = props.me?.playerId;
          map[d.event.id] = !!meId && (d.registeredPlayers ?? []).some((p) => p.id === meId);
        });
        setRegisteredIds(map);
      })
      .catch(() => {
        if (!cancelled) setRegisteredIds({});
      });
    return () => {
      cancelled = true;
    };
  }, [events, props.me?.playerId]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayIso = formatDate(now);
    const gamesToday = (events ?? []).filter((e) => e.date === todayIso).length;
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const gamesWeek = (events ?? []).filter((e) => {
      const d = new Date(e.date);
      return d >= now && d <= weekEnd;
    }).length;
    const activePlayers = rating?.length ?? 0;
    return { activePlayers, gamesToday, gamesWeek };
  }, [events, rating]);

  const upcoming = (events ?? []).slice(0, 2);
  const topPlayers = (rating ?? []).slice(0, 3);

  async function joinEvent(eventId: string) {
    if (!props.me) {
      nav("/login");
      return;
    }
    if (!props.me.playerId) {
      setJoinError("Не удалось определить игрока (playerId). Перезайдите в аккаунт.");
      return;
    }
    setJoiningId(eventId);
    setJoinError(null);
    try {
      await api.registerForEvent(eventId, props.me.playerId);
      nav(`/events/${eventId}`);
    } catch (e: any) {
      setJoinError(e?.message ?? "Ошибка записи");
    } finally {
      setJoiningId(null);
    }
  }

  const quickStats = [
    { label: "Активных игроков", value: String(stats.activePlayers), icon: Users, color: "text-primary" },
    { label: "Игр сегодня", value: String(stats.gamesToday), icon: Gamepad2, color: "text-amber-400" },
    { label: "Матчей за неделю", value: String(stats.gamesWeek), icon: TrendingUp, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-background p-8 lg:p-12">
        <div className="relative z-10 max-w-2xl">
          <Badge className="mb-4 bg-primary/20 text-primary border-primary/30 border">
            <Zap className="mr-1 h-3 w-3" />
            Сезон {new Date().getFullYear()}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
            Добро пожаловать в <span className="text-primary">padix</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Организуйте игры в падел, отслеживайте свой рейтинг и находите партнеров для игры.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/games">
                <Gamepad2 className="mr-2 h-5 w-5" />
                Найти игру
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to={props.me ? "/create" : "/register"}>
                Создать игру
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-10 h-48 w-48 rounded-full bg-primary/5 blur-2xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {quickStats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Ближайшие игры
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/games">
                Все игры
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {joinError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{joinError}</div>
            ) : null}
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            ) : upcoming.length === 0 ? (
              <div className="text-sm text-muted-foreground">Ближайших игр нет.</div>
            ) : (
              upcoming.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4 transition-colors hover:bg-secondary"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{formatLabel(e.format)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatEventDate(e.date)} • {timeRange(e.startTime, e.endTime)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {e.registeredCount}/{e.courtsCount * 4}
                    </Badge>
                    {registeredIds[e.id] ? (
                      <Button size="sm" variant="secondary" onClick={() => nav(`/events/${e.id}`)}>
                        Вы записаны
                      </Button>
                    ) : (
                      <Button size="sm" disabled={joiningId === e.id} onClick={() => joinEvent(e.id)}>
                        Вступить
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Топ игроков
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/rating">
                Полный рейтинг
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            ) : topPlayers.length === 0 ? (
              <div className="text-sm text-muted-foreground">Пока нет участников.</div>
            ) : (
              topPlayers.map((player, i) => {
                const rank = i + 1;
                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                          rank === 1
                            ? "border-amber-500/30 bg-amber-500/20 text-amber-400"
                            : rank === 2
                              ? "border-slate-400/30 bg-slate-400/20 text-slate-300"
                              : "border-orange-500/30 bg-orange-500/20 text-orange-400"
                        }`}
                      >
                        {rank === 1 ? <Trophy className="h-5 w-5" /> : <span className="font-bold">{rank}</span>}
                      </div>
                      <div>
                        <Badge variant="secondary" className="font-medium">
                          {player.name}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xl font-bold tabular-nums">{player.rating}</p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

