import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Calendar, CalendarDays, Clock, Globe, Info, List, Lock, Plus, Search, Trophy, Users, X } from "lucide-react";
import { api, Event } from "../../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GamesCalendar } from "@/components/games-calendar";
import { cn } from "@/lib/utils";
import { Dict, useI18n } from "@/lib/i18n";
import { formatEventDate, timeRange } from "../utils";

const TR = {
  "visibility.private": { ru: "Приватная игра", en: "Private game" },
  "visibility.public": { ru: "Открытая игра", en: "Open game" },
  "status.registration": { ru: "Регистрация", en: "Registration" },
  "status.inProgress": { ru: "В процессе", en: "Live" },
  "status.finished": { ru: "Завершено", en: "Finished" },
  "header.title": { ru: "Игры", en: "Games" },
  "header.subtitle": { ru: "Выберите игру для участия", en: "Pick a game to join" },
  "header.createTournament": { ru: "Создать турнир", en: "Create tournament" },
  "header.createGame": { ru: "Создать игру", en: "Create game" },
  "toggle.list": { ru: "Игры", en: "Games" },
  "toggle.calendar": { ru: "Календарь", en: "Calendar" },
  "filter.all": { ru: "Все", en: "All" },
  "filter.public": { ru: "Открытые", en: "Open" },
  "filter.mine": { ru: "Мои", en: "Mine" },
  "search.placeholder": { ru: "Поиск по названию игры…", en: "Search by game name…" },
  "search.clear": { ru: "Очистить поиск", en: "Clear search" },
  "search.reset": { ru: "Сбросить поиск", en: "Reset search" },
  "common.loading": { ru: "Загрузка…", en: "Loading…" },
  "common.error": { ru: "Ошибка", en: "Error" },
  "list.loadFailed": { ru: "Не удалось загрузить: {error}", en: "Failed to load: {error}" },
  "list.empty": { ru: "Нет предстоящих игр.", en: "No upcoming games." },
  "list.nothingFound": { ru: "Ничего не найдено по фильтру.", en: "Nothing matches the filter." },
  "list.title": { ru: "Ближайшие игры (2 недели)", en: "Upcoming games (2 weeks)" },
  "list.hint": { ru: "Нажми на игру", en: "Click a game" },
  "table.date": { ru: "Дата", en: "Date" },
  "table.time": { ru: "Время", en: "Time" },
  "table.mode": { ru: "Режим", en: "Mode" },
  "table.players": { ru: "Игроки", en: "Players" },
  "table.status": { ru: "Статус", en: "Status" },
  "mode.balancedShort": { ru: "Баланс", en: "Balanced" },
  "mode.balanced": { ru: "Равный бой", en: "Balanced" },
  "mode.roundRobin": { ru: "Каждый с каждым", en: "Round robin" },
  "badge.youRegistered": { ru: "Вы записаны", en: "You're registered" },
  "badge.registered": { ru: "Записан", en: "Registered" },
  "event.fallbackTitle": { ru: "Игра", en: "Game" },
  "calendar.noGames": { ru: "В этот день игр нет.", en: "No games on this day." },
  "calendar.pickDay": { ru: "Выберите день в календаре", en: "Pick a day in the calendar" },
  "day.titleFor": { ru: "Игры за {date}", en: "Games on {date}" },
  "day.titleFallback": { ru: "Игры за выбранный день", en: "Games for the selected day" },
  "day.listSr": { ru: "Список игр за выбранный день", en: "List of games for the selected day" },
} satisfies Dict;

type TFn = (key: keyof typeof TR & string, vars?: Record<string, string | number>) => string;

interface GamesPageLocationState {
  view?: 'list' | 'calendar';
  selectedDate?: string;
  selectedEventIds?: string[];
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Маленькая иконка-маркер 🔒/🌐 перед названием игры. */
function VisibilityIcon({ visibility, t }: { visibility: Event["visibility"]; t: TFn }) {
  if (visibility === "PRIVATE") {
    return <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("visibility.private")} />;
  }
  return <Globe className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-label={t("visibility.public")} />;
}

function getStatusBadge(t: TFn, status: Event["status"], className?: string) {
  switch (status) {
    case "OPEN_FOR_REGISTRATION":
      return (
        <Badge className={cn("bg-primary/20 text-primary hover:bg-primary/30 border-primary/30 border", className)}>
          {t("status.registration")}
        </Badge>
      );
    case "IN_PROGRESS":
      return (
        <Badge className={cn("bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 border-amber-500/40 dark:border-amber-500/30 border", className)}>
          {t("status.inProgress")}
        </Badge>
      );
    case "FINISHED":
      return (
        <Badge variant="secondary" className={className}>
          {t("status.finished")}
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
  const { t, lang } = useI18n(TR);
  const nav = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calendarEvents, setCalendarEvents] = useState<Event[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Event[]>([]);
  const [registeredIds, setRegisteredIds] = useState<Record<string, boolean>>({});

  // Фильтр-вкладка (Все / 🌐 Открытые / 🔒 Мои) и поиск по названию.
  // Сохраняем в localStorage чтобы не сбрасывалось при навигации.
  type FilterTab = "all" | "public" | "mine";
  const [filterTab, setFilterTab] = useState<FilterTab>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("padix.games.filterTab") : null;
    return (stored === "public" || stored === "mine" || stored === "all") ? stored : "all";
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return typeof window !== "undefined" ? (window.localStorage.getItem("padix.games.searchQuery") ?? "") : "";
  });
  useEffect(() => { try { window.localStorage.setItem("padix.games.filterTab", filterTab); } catch { /* ignore */ } }, [filterTab]);
  useEffect(() => { try { window.localStorage.setItem("padix.games.searchQuery", searchQuery); } catch { /* ignore */ } }, [searchQuery]);

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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.error")))
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
    setCalendarLoading(true);
    try {
      const res = await api.getUpcomingEvents(from, to);
      setCalendarEvents(res ?? []);
    } catch {
      setCalendarEvents([]);
    } finally {
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    if (view === "calendar") {
      setCalendarLoading(true);
      loadCalendarEvents(new Date());
    }
  }, [view]);

  useEffect(() => {
    const state = location.state as GamesPageLocationState | undefined;
    if (!state?.view) return;

    setView(state.view);

    if (state.view === "calendar" && state.selectedDate) {
      const restoredDate = new Date(state.selectedDate);
      setSelectedDate(restoredDate);

      // Перезагрузить события для месяца при восстановлении календаря
      const from = formatDate(new Date(restoredDate.getFullYear(), restoredDate.getMonth(), 1));
      const to = formatDate(new Date(restoredDate.getFullYear(), restoredDate.getMonth() + 1, 0));
      setCalendarLoading(true);
      api.getUpcomingEvents(from, to)
        .then(res => {
          setCalendarEvents(res ?? []);
          // Восстановить выбранные события для даты
          const dayKey = formatDate(restoredDate);
          const selectedEvts = (res ?? []).filter(e => e.date === dayKey);
          setSelectedEvents(selectedEvts);
        })
        .catch(() => {
          setCalendarEvents([]);
          setSelectedEvents([]);
        })
        .finally(() => setCalendarLoading(false));
    }
  }, [location.state]);

  const shortMonths = lang === "ru"
    ? ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shortDate = (dateStr: string) => {
    const [, m, d] = dateStr.split("-").map((v) => Number(v));
    if (!m || !d) return dateStr;
    return `${d} ${shortMonths[m - 1] ?? ""}`;
  };

  // Фильтрация по табу + поиску. Считаем здесь, чтобы и пустое-состояние и список были консистентны.
  // Также скрываем smoke-test события (созданные test-ui скриптами) — они захламляют UX.
  // Имена вида "smoke-series-1779292981" приходят из E2E/нагрузочных проверок.
  const filteredEvents = useMemo(() => {
    if (!events) return null;
    const q = searchQuery.trim().toLowerCase();
    return events.filter((e) => {
      if ((e.title ?? "").startsWith("smoke-series-")) return false;
      if (filterTab === "public" && e.visibility !== "PUBLIC") return false;
      if (filterTab === "mine" && !registeredIds[e.id]) return false;
      if (q && !(e.title ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filterTab, searchQuery, registeredIds]);

  const filterBar = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {([
          { id: "all" as FilterTab, label: t("filter.all"), icon: null },
          { id: "public" as FilterTab, label: t("filter.public"), icon: Globe },
          { id: "mine" as FilterTab, label: t("filter.mine"), icon: Lock },
        ]).map((tab) => {
          const active = filterTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-secondary/40",
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            aria-label={t("search.clear")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const listContent = useMemo(() => {
    if (loading) {
      return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
    }
    if (error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {t("list.loadFailed", { error })}
        </div>
      );
    }
    if (!events?.length) {
      return (
        <div className="space-y-3">
          {filterBar}
          <div className="rounded-lg border border-border bg-secondary/30 p-6 text-sm text-muted-foreground">
            {t("list.empty")}
          </div>
        </div>
      );
    }
    if (!filteredEvents?.length) {
      return (
        <div className="space-y-3">
          {filterBar}
          <div className="rounded-lg border border-border bg-secondary/30 p-6 text-sm text-muted-foreground">
            {t("list.nothingFound")}
            {searchQuery && (
              <>
                {" "}
                <button type="button" onClick={() => setSearchQuery("")} className="underline">
                  {t("search.reset")}
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {filterBar}
        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {filteredEvents.map((e) => (
            <button
              key={e.id}
              type="button"
              className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-secondary/50 transition-colors flex gap-3"
              onClick={() => {
                const navigationState: GamesPageLocationState = {
                  view,
                  selectedDate: selectedDate ? selectedDate.toISOString() : undefined,
                  selectedEventIds: selectedEvents.map(se => se.id),
                };
                nav(`/events/${e.id}`, { state: navigationState });
              }}
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                {e.title && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <VisibilityIcon visibility={e.visibility} t={t} />
                    <div className="font-medium text-sm truncate">{e.title}</div>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{shortDate(e.date)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{timeRange(e.startTime, e.endTime)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{e.pairingMode === "BALANCED" ? t("mode.balancedShort") : t("mode.roundRobin")}</span>
                  <span className="text-muted-foreground">·</span>
                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground tabular-nums">{e.registeredCount}/{e.courtsCount * 4}</span>
                </div>
              </div>
              <div className="flex flex-col items-end justify-center gap-1.5 shrink-0">
                {registeredIds[e.id] && (
                  <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                    {t("badge.youRegistered")}
                  </Badge>
                )}
                {getStatusBadge(t, e.status, "text-xs")}
              </div>
            </button>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-4 pl-4 pr-6 font-medium">{t("table.date")}</th>
                <th className="pb-4 px-4 font-medium">{t("table.time")}</th>
                <th className="pb-4 px-4 font-medium">{t("table.mode")}</th>
                <th className="pb-4 px-4 font-medium">{t("table.players")}</th>
                <th className="pb-4 pr-4 pl-4 font-medium">{t("table.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredEvents.map((e) => (
                <tr
                  key={e.id}
                  className="group cursor-pointer transition-colors hover:bg-secondary/50"
                  onClick={() => {
                    const navigationState: GamesPageLocationState = {
                      view,
                      selectedDate: selectedDate ? selectedDate.toISOString() : undefined,
                      selectedEventIds: selectedEvents.map(se => se.id),
                    };
                    nav(`/events/${e.id}`, { state: navigationState });
                  }}
                >
                  <td className="py-5 pl-4 pr-6 align-middle">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        {e.title && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <VisibilityIcon visibility={e.visibility} t={t} />
                            <div className="font-medium truncate">{e.title}</div>
                          </div>
                        )}
                        <div className={cn("text-muted-foreground whitespace-nowrap", e.title ? "text-xs" : "font-medium text-sm text-foreground")}>
                          {formatEventDate(e.date)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-4 align-middle">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="tabular-nums">{timeRange(e.startTime, e.endTime)}</span>
                    </div>
                  </td>
                  <td className="py-5 px-4 align-middle">
                    <span className="whitespace-nowrap">{e.pairingMode === "BALANCED" ? t("mode.balanced") : t("mode.roundRobin")}</span>
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
                          {t("badge.youRegistered")}
                        </Badge>
                      )}
                      {getStatusBadge(t, e.status, "text-xs shrink-0")}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }, [error, events, filteredEvents, loading, nav, registeredIds, filterBar, searchQuery, lang, t]);

  return (
    <div className="space-y-5">
      {/* Header: title left, create button right */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("header.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("header.subtitle")}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Link to="/create?kind=tournament">
            <Button variant="outline" className="w-full">
              <Trophy className="mr-2 h-4 w-4" />
              {t("header.createTournament")}
            </Button>
          </Link>
          <Link to="/create">
            <Button className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              {t("header.createGame")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Toggle: Игры / Календарь */}
      <div className="relative flex rounded-xl border border-border bg-secondary/30 p-1 sm:w-fit sm:ml-auto">
        <div
          className="absolute top-1 bottom-1 rounded-lg bg-primary shadow-lg transition-all duration-300 ease-in-out"
          style={{
            width: "calc(50% - 4px)",
            left: view === "list" ? "4px" : "calc(50%)",
          }}
        />
        <button
          type="button"
          onClick={() => setView("list")}
          className={cn(
            "relative z-10 flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 sm:py-2 text-sm font-semibold transition-colors duration-300 min-w-[120px]",
            view === "list"
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <List className="h-4 w-4" />
          {t("toggle.list")}
        </button>
        <button
          type="button"
          onClick={() => setView("calendar")}
          className={cn(
            "relative z-10 flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 sm:py-2 text-sm font-semibold transition-colors duration-300 min-w-[120px]",
            view === "calendar"
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarDays className="h-4 w-4" />
          {t("toggle.calendar")}
        </button>
      </div>

      {/* Content */}
      {view === "list" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              {t("list.title")}
            </CardTitle>
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>{t("list.hint")}</span>
            </div>
          </CardHeader>
          <CardContent>{listContent}</CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: calendar + dialog */}
          <div className="sm:hidden">
            <GamesCalendar
              open={true}
              onOpenChange={() => {}}
              inline
              events={calendarEvents}
              loading={calendarLoading}
              onMonthChange={loadCalendarEvents}
              onSelectDate={(date) => {
                const dayKey = formatDate(date);
                setSelectedDate(date);
                setSelectedEvents((calendarEvents ?? []).filter((e) => e.date === dayKey));
                setDayOpen(true);
              }}
            />
          </div>

          {/* Desktop: calendar left + events right */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_1fr] sm:gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
            <GamesCalendar
              open={true}
              onOpenChange={() => {}}
              inline
              events={calendarEvents}
              loading={calendarLoading}
              onMonthChange={loadCalendarEvents}
              onSelectDate={(date) => {
                const dayKey = formatDate(date);
                setSelectedDate(date);
                setSelectedEvents((calendarEvents ?? []).filter((e) => e.date === dayKey));
              }}
            />
            <div className="rounded-xl border border-border bg-card p-5 min-h-[300px]">
              {selectedDate ? (
                <>
                  <h3 className="text-sm font-semibold mb-4">
                    {formatEventDate(formatDate(selectedDate))}
                  </h3>
                  {selectedEvents.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("calendar.noGames")}</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="w-full text-left rounded-lg border border-border bg-secondary/30 p-3 hover:bg-secondary/50 transition-colors"
                          onClick={() => {
                            const navigationState: GamesPageLocationState = {
                              view,
                              selectedDate: selectedDate ? selectedDate.toISOString() : undefined,
                              selectedEventIds: selectedEvents.map(se => se.id),
                            };
                            nav(`/events/${e.id}`, { state: navigationState });
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <VisibilityIcon visibility={e.visibility} t={t} />
                                <div className="font-medium text-sm truncate">{e.title || t("event.fallbackTitle")}</div>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {timeRange(e.startTime, e.endTime)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {registeredIds[e.id] && (
                                <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                                  {t("badge.registered")}
                                </Badge>
                              )}
                              {getStatusBadge(t, e.status, "text-xs")}
                              <span className="text-xs text-muted-foreground tabular-nums">
                                <Users className="h-3 w-3 inline mr-0.5" />
                                {e.registeredCount}/{e.courtsCount * 4}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  {t("calendar.pickDay")}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Mobile day dialog */}
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="sm:max-w-[600px] sm:hidden">
          <DialogHeader>
            <DialogTitle>
              {selectedDate ? t("day.titleFor", { date: formatEventDate(formatDate(selectedDate)) }) : t("day.titleFallback")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("day.listSr")}</DialogDescription>
          </DialogHeader>
          {selectedEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("calendar.noGames")}</div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="w-full text-left rounded-lg border border-border bg-secondary/30 p-4 hover:bg-secondary/50 transition-colors"
                  onClick={() => {
                    const navigationState: GamesPageLocationState = {
                      view,
                      selectedDate: selectedDate ? selectedDate.toISOString() : undefined,
                      selectedEventIds: selectedEvents.map(se => se.id),
                    };
                    setDayOpen(false);
                    nav(`/events/${e.id}`, { state: navigationState });
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <VisibilityIcon visibility={e.visibility} t={t} />
                        <div className="font-medium truncate">{e.title || t("event.fallbackTitle")}</div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {timeRange(e.startTime, e.endTime)} · {getStatusBadge(t, e.status)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {registeredIds[e.id] && (
                        <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                          {t("badge.youRegistered")}
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
