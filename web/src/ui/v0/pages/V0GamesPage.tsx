import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, CalendarDays, Clock, Info, Plus, Users } from "lucide-react";
import { api, Event } from "../../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GamesCalendar } from "@/components/games-calendar";
import { cn } from "@/lib/utils";
import { formatEventDate, timeRange } from "../utils";

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getStatusBadge(status: Event["status"], className?: string) {
  switch (status) {
    case "OPEN_FOR_REGISTRATION":
      return (
        <Badge className={cn("bg-primary/20 text-primary hover:bg-primary/30 border-primary/30 border", className)}>
          Регистрация
        </Badge>
      );
    case "IN_PROGRESS":
      return (
        <Badge className={cn("bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-500/30 border", className)}>
          В процессе
        </Badge>
      );
    case "FINISHED":
      return (
        <Badge variant="secondary" className={className}>
          Завершено
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className={className}>
          {status}
        </Badge>
      );
  }
}

export function V0GamesPage(props: { me: any }) {
  const nav = useNavigate();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Event[]>([]);
  const [dayOpen, setDayOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Event[]>([]);
  const [registeredIds, setRegisteredIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (props.me && !props.me.surveyCompleted) return;
    setLoading(true);
    setError(null);
    const now = new Date();
    const from = formatDate(now);
    const to = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
    api
      .getUpcomingEvents(from, to)
      .then((d) => setEvents((d ?? []).filter((e) => e.status !== "FINISHED")))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [props.me]);

  useEffect(() => {
    const mainIds = (events ?? []).map((e) => e.id);
    const selectedIds = selectedEvents.map((e) => e.id);
    const allIds = [...new Set([...mainIds, ...selectedIds])];
    if (allIds.length === 0 || !props.me?.playerId) {
      setRegisteredIds({});
      return;
    }
    let cancelled = false;
    Promise.all(allIds.map((id) => api.getEventDetails(id)))
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
    return () => { cancelled = true; };
  }, [events, selectedEvents, props.me?.playerId]);

  const loadCalendarEvents = async (date: Date) => {
    const from = formatDate(new Date(date.getFullYear(), date.getMonth(), 1));
    const to = formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    try {
      const res = await api.getUpcomingEvents(from, to);
      setCalendarEvents(res ?? []);
    } catch {
      setCalendarEvents([]);
    }
  };

  const content = useMemo(() => {
    if (loading) {
      return <div className="text-sm text-muted-foreground">Загрузка…</div>;
    }
    if (error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          Не удалось загрузить: {error}
        </div>
      );
    }
    if (!events?.length) {
      return (
        <div className="rounded-lg border border-border bg-secondary/30 p-6 text-sm text-muted-foreground">
          Нет предстоящих игр.
        </div>
      );
    }

    const shortMonths = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    const shortDate = (dateStr: string) => {
      const [y, m, d] = dateStr.split("-").map((v) => Number(v));
      if (!y || !m || !d) return dateStr;
      return `${d} ${shortMonths[m - 1] ?? ""}`;
    };

    return (
      <>
        {/* Мобильная версия — карточки */}
        <div className="space-y-2 md:hidden">
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-secondary/50 transition-colors flex gap-3"
              onClick={() => nav(`/events/${e.id}`)}
            >
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm whitespace-nowrap">{shortDate(e.date)}</span>
                  <span className="text-muted-foreground text-sm tabular-nums">{timeRange(e.startTime, e.endTime)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{e.pairingMode === "BALANCED" ? "Баланс" : "Американка"}</span>
                  <span className="text-muted-foreground">·</span>
                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground tabular-nums">{e.registeredCount}/{e.courtsCount * 4}</span>
                </div>
              </div>
              <div className="flex flex-col items-end justify-center gap-1.5 shrink-0">
                {registeredIds[e.id] && (
                  <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                    Вы записаны
                  </Badge>
                )}
                {getStatusBadge(e.status, "text-xs")}
              </div>
            </button>
          ))}
        </div>

        {/* Десктоп — таблица */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-4 pl-4 pr-6 font-medium">Дата</th>
                <th className="pb-4 px-4 font-medium">Время</th>
                <th className="pb-4 px-4 font-medium">Формат</th>
                <th className="pb-4 px-4 font-medium">Игроки</th>
                <th className="pb-4 pr-4 pl-4 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="group cursor-pointer transition-colors hover:bg-secondary/50"
                  onClick={() => nav(`/events/${e.id}`)}
                >
                  <td className="py-5 pl-4 pr-6 align-middle">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="font-medium whitespace-nowrap">{formatEventDate(e.date)}</span>
                    </div>
                  </td>
                  <td className="py-5 px-4 align-middle">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="tabular-nums">{timeRange(e.startTime, e.endTime)}</span>
                    </div>
                  </td>
                  <td className="py-5 px-4 align-middle">
                    <span className="whitespace-nowrap">{e.pairingMode === "BALANCED" ? "Баланс" : "Американка"}</span>
                  </td>
                  <td className="py-5 px-4 align-middle">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="tabular-nums">{e.registeredCount}/{e.courtsCount * 4}</span>
                    </div>
                  </td>
                  <td className="py-5 px-4 align-middle">
                    <div className="flex items-center gap-2">
                      {registeredIds[e.id] && (
                        <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30 shrink-0">
                          Вы записаны
                        </Badge>
                      )}
                      {getStatusBadge(e.status, "text-xs shrink-0")}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }, [error, events, loading, nav, registeredIds]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ближайшие игры</h1>
          <p className="mt-1 text-muted-foreground">Выберите игру для участия</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-border bg-secondary p-1">
          <Link
            to="/create"
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors bg-primary text-primary-foreground",
            )}
          >
            <Plus className="mr-2 inline h-4 w-4" />
            Создать игру
          </Link>
          <button
            onClick={() => setCalendarOpen(true)}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            type="button"
          >
            <CalendarDays className="mr-2 inline h-4 w-4" />
            Календарь
          </button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            Ближайшие игры (2 недели)
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <span>Нажми на игру, чтобы открыть корты/раунды</span>
          </div>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>

      <GamesCalendar
        open={calendarOpen}
        onOpenChange={(open) => {
          setCalendarOpen(open);
          if (open) {
            loadCalendarEvents(new Date());
          }
        }}
        events={calendarEvents}
        onMonthChange={loadCalendarEvents}
        onSelectDate={(date) => {
          const dayKey = formatDate(date);
          setSelectedDate(date);
          setSelectedEvents((calendarEvents ?? []).filter((e) => e.date === dayKey));
          setCalendarOpen(false);
          setDayOpen(true);
        }}
      />

      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {selectedDate ? `Игры за ${formatEventDate(formatDate(selectedDate))}` : "Игры за выбранный день"}
            </DialogTitle>
          </DialogHeader>
          {selectedEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground">В этот день игр нет.</div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="w-full text-left rounded-lg border border-border bg-secondary/30 p-4 hover:bg-secondary/50 transition-colors"
                  onClick={() => {
                    setDayOpen(false);
                    nav(`/events/${e.id}`);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{e.title || "Игра"}</div>
                      <div className="text-sm text-muted-foreground">
                        {timeRange(e.startTime, e.endTime)} · {getStatusBadge(e.status)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {registeredIds[e.id] && (
                        <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                          Вы записаны
                        </Badge>
                      )}
                      <Users className="h-4 w-4" />
                      <span className="tabular-nums">{e.registeredCount}/{e.courtsCount * 4}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

