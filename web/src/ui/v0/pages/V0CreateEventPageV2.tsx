import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gamepad2, Users, Clock, Calendar, Lightbulb, Users2, MapPin, Zap, Send, MessageCircle, Users as UsersIcon, Lock, Globe, Repeat, ChevronLeft, Info, Pencil } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, EventFormat, EventVisibility, PairingMode, TelegramChat } from "../../../lib/api";

const FORMATS: { id: EventFormat; title: string; desc: string }[] = [
  { id: "AMERICANA", title: "Американо", desc: "Партнёры меняются каждый раунд — играешь со всеми и против всех. Очки лично." },
  { id: "MEXICANO", title: "Мексикано", desc: "Пары каждый раунд по текущей таблице лидеров — всегда равная борьба." },
  { id: "FIXED_PAIRS", title: "Фикс. пары", desc: "Партнёр не меняется; пары играют круговую (каждая с каждой)." },
];
const WEEKDAYS = [
  { id: "MON", label: "Пн" }, { id: "TUE", label: "Вт" }, { id: "WED", label: "Ср" },
  { id: "THU", label: "Чт" }, { id: "FRI", label: "Пт" }, { id: "SAT", label: "Сб" }, { id: "SUN", label: "Вс" },
];
const LEVELS = ["2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5", "6.0", "6.5", "7.0"];
// Уровень падел ↔ Elo (ориентир; бэкенд хранит Elo). Правится централизованно тут.
const LEVEL_TO_ELO: Record<string, number> = {
  "2.0": 900, "2.5": 1050, "3.0": 1150, "3.5": 1250, "4.0": 1350, "4.5": 1500,
  "5.0": 1650, "5.5": 1800, "6.0": 1950, "6.5": 2100, "7.0": 2250,
};

function todayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function V0CreateEventPageV2(props: {
  me: any;
  meLoaded?: boolean;
}) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const editSeriesId = searchParams.get("editSeries");
  const isEditing = !!editSeriesId;
  const [recurring, setRecurring] = useState(searchParams.get("recurring") === "1" || isEditing);
  const [daysOfWeek, setDaysOfWeek] = useState<Set<string>>(new Set());
  const [materializeHoursBefore, setMaterializeHoursBefore] = useState(168);
  const [materializeAtHour, setMaterializeAtHour] = useState(9);
  const [materializeMode, setMaterializeMode] = useState<"HOURS_BEFORE" | "WEEKLY_SUNDAY">("HOURS_BEFORE");
  // Per-series уведомления (override глобальных Telegram-настроек).
  // null = использовать глобальные. Конкретное значение = переопределить для этой серии.
  const [seriesReminderHours, setSeriesReminderHours] = useState<number | null>(null);
  const [seriesPinAnnouncement, setSeriesPinAnnouncement] = useState<boolean | null>(null);
  const [title, setTitle] = useState("Американка");
  const [date, setDate] = useState(todayIso());
  const [startHour, setStartHour] = useState("19");
  const [startMinute, setStartMinute] = useState("00");
  const [endHour, setEndHour] = useState("21");
  const [endMinute, setEndMinute] = useState("00");
  const [pairingMode, setPairingMode] = useState<PairingMode>("ROUND_ROBIN");
  const [format, setFormat] = useState<EventFormat>("AMERICANA");
  const [courts, setCourts] = useState(1);
  const [courtNames, setCourtNames] = useState<string[]>(["Корт A"]);
  const [autoRounds, setAutoRounds] = useState(true);
  const [rounds, setRounds] = useState(6);
  const [pointsPerPlayer, setPointsPerPlayer] = useState(6);
  // Система счёта: POINTS (американка, очки) или SETS (сеты/геймы как в теннисе).
  const [scoringMode, setScoringMode] = useState<"POINTS" | "SETS">("POINTS");
  const [gamesPerSet, setGamesPerSet] = useState(6);
  const [setsPerMatch, setSetsPerMatch] = useState(1);
  const [visibility, setVisibility] = useState<EventVisibility>("PUBLIC");
  const [ratingLimitEnabled, setRatingLimitEnabled] = useState(false);
  const [minRatingStr, setMinRatingStr] = useState("");
  const [maxRatingStr, setMaxRatingStr] = useState("");
  const [showFmtDesc, setShowFmtDesc] = useState(false);
  const [editCourtNames, setEditCourtNames] = useState(false);
  const [minLevelIdx, setMinLevelIdx] = useState(2); // 3.0
  const [maxLevelIdx, setMaxLevelIdx] = useState(4); // 4.0
  const [levelAnchor, setLevelAnchor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roundsMode, setRoundsMode] = useState<"auto" | "manual">("auto");
  const [step] = useState(1);
  const [telegramChats, setTelegramChats] = useState<TelegramChat[]>([]);
  const [selectedTgChatIds, setSelectedTgChatIds] = useState<Set<string>>(new Set());

  // Initial-загрузка: параллельно тянем telegram-чаты и (если редактируем) серию,
  // и только когда оба готовы — снимаем initialLoading и показываем форму.
  // Без этого «Отправить анонс в Telegram» подгружался позже самой формы; плюс был
  // race между TG-эффектом (set всех) и series-эффектом (set сохранённого).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tgStatus, tgList, series] = await Promise.all([
          api.getTelegramStatus().catch(() => null),
          api.getTelegramChats().catch(() => [] as TelegramChat[]),
          editSeriesId ? api.getEventSeries(editSeriesId) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const groupOnly = (tgStatus?.enabled ? tgList : []).filter((c) => c.chatType !== "PRIVATE");
        setTelegramChats(groupOnly);

        if (series && editSeriesId) {
          // Редактируем существующую серию: заполняем поля её данными.
          setTitle(series.title);
          setDaysOfWeek(new Set(series.daysOfWeek.split(",").map((d) => d.trim()).filter(Boolean)));
          const [sh, sm] = series.startTime.slice(0, 5).split(":");
          const [eh, em] = series.endTime.slice(0, 5).split(":");
          setStartHour(sh); setStartMinute(sm);
          setEndHour(eh); setEndMinute(em);
          setCourts(series.courtsCount);
          setPointsPerPlayer(series.pointsPerPlayerPerMatch);
          setVisibility(series.visibility);
          setMaterializeHoursBefore(series.materializeHoursBefore);
          const matH = parseInt(series.materializeAtTime?.slice(0, 2) ?? "9", 10);
          if (!Number.isNaN(matH)) setMaterializeAtHour(matH);
          setMaterializeMode(series.materializeMode ?? "HOURS_BEFORE");
          setSeriesReminderHours(series.reminderHours ?? null);
          setSeriesPinAnnouncement(series.pinAnnouncement ?? null);
          // Галки чатов = ровно сохранённое (пусто → ничего не выбрано).
          setSelectedTgChatIds(new Set(series.targetChatIds ?? []));
        } else {
          // Создание новой игры/серии: по умолчанию выбираем все доступные группы.
          setSelectedTgChatIds(new Set(groupOnly.map((c) => c.id)));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Не удалось загрузить");
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editSeriesId]);

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);


  useEffect(() => {
    setAutoRounds(roundsMode === "auto");
  }, [roundsMode]);

  useEffect(() => {
    if (date !== todayIso()) return;
    const now = new Date();
    const nextStartHour = now.getHours().toString().padStart(2, "0");
    setStartHour(nextStartHour);
    setStartMinute("00");
    const end = Math.min(now.getHours() + 2, 23).toString().padStart(2, "0");
    setEndHour(end);
    setEndMinute("00");
  }, [date]);

  useEffect(() => {
    setCourtNames((prev) => {
      const next = [...prev];
      if (next.length < courts) {
        for (let i = next.length; i < courts; i += 1) {
          next.push(`Корт ${String.fromCharCode(65 + i)}`);
        }
      } else if (next.length > courts) {
        next.length = courts;
      }
      return next;
    });
  }, [courts]);

  // Уровни → Elo-строки, которые читает onSubmit (бэкенд хранит Elo).
  useEffect(() => {
    setMinRatingStr(String(LEVEL_TO_ELO[LEVELS[minLevelIdx]]));
    setMaxRatingStr(String(LEVEL_TO_ELO[LEVELS[maxLevelIdx]]));
  }, [minLevelIdx, maxLevelIdx]);
  // Сеты имеют смысл только в фиксированных парах; иначе — очки.
  useEffect(() => {
    if (format !== "FIXED_PAIRS") setScoringMode("POINTS");
  }, [format]);

  const minPlayers = useMemo(() => Math.max(1, courts) * 4, [courts]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const startTime = `${startHour}:${startMinute}`;
      const endTime = `${endHour}:${endMinute}`;

      // Регулярная игра (подписка): создаём или обновляем EventSeries.
      if (recurring) {
        if (daysOfWeek.size === 0) {
          throw new Error("Выберите хотя бы один день недели");
        }
        const tz = (() => {
          try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
        })();
        if (editSeriesId) {
          await api.updateEventSeries(editSeriesId, {
            title,
            daysOfWeek: Array.from(daysOfWeek).join(","),
            startTime,
            endTime,
            timezone: tz,
            courtsCount: courts,
            pairingMode,
            scoringMode: "POINTS",
            pointsPerPlayerPerMatch: pointsPerPlayer,
            visibility,
            materializeHoursBefore,
            materializeMode,
            // Per-series override уведомлений. null = сбросить (использовать глобальные).
            ...(seriesReminderHours === null
              ? { clearReminderHours: true }
              : { reminderHours: seriesReminderHours }),
            ...(seriesPinAnnouncement === null
              ? { clearPinAnnouncement: true }
              : { pinAnnouncement: seriesPinAnnouncement }),
            targetChatIds: Array.from(selectedTgChatIds),
          });
          nav(`/settings?tab=subscriptions&highlight=${editSeriesId}`);
          return;
        }
        const created = await api.createEventSeries({
          title,
          daysOfWeek: Array.from(daysOfWeek).join(","),
          startTime,
          endTime,
          timezone: tz,
          courtsCount: courts,
          pairingMode,
          scoringMode: "POINTS",
          pointsPerPlayerPerMatch: pointsPerPlayer,
          visibility,
          materializeHoursBefore,
          materializeAtTime: `${String(materializeAtHour).padStart(2, "0")}:00`,
          materializeMode,
          // Per-series override уведомлений (null → бэк сохранит null → использует глобальные).
          reminderHours: seriesReminderHours,
          pinAnnouncement: seriesPinAnnouncement,
          targetChatIds: Array.from(selectedTgChatIds),
        });
        nav(`/settings?tab=subscriptions&highlight=${created.id}`);
        return;
      }

      const startDt = new Date(`${date}T${startTime}`);
      let endDt = new Date(`${date}T${endTime}`);
      // Если окончание раньше начала — значит игра переходит за полночь
      if (endDt.getTime() <= startDt.getTime()) {
        endDt = new Date(endDt.getTime() + 24 * 60 * 60 * 1000);
      }
      const todayStr = todayIso();
      if (Number.isNaN(startDt.getTime()) || date < todayStr) {
        throw new Error("Дата игры не может быть в прошлом");
      }
      // Ограничение по рейтингу (задача #9): опционально, обе границы необязательны.
      let minRating: number | undefined;
      let maxRating: number | undefined;
      if (ratingLimitEnabled) {
        const minRaw = minRatingStr.trim();
        const maxRaw = maxRatingStr.trim();
        if (minRaw === "" && maxRaw === "") {
          throw new Error("Укажите минимум и/или максимум рейтинга, либо отключите ограничение");
        }
        if (minRaw !== "") {
          const v = Number(minRaw);
          if (!Number.isFinite(v) || v < 0) throw new Error("Минимальный рейтинг должен быть числом ≥ 0");
          minRating = Math.round(v);
        }
        if (maxRaw !== "") {
          const v = Number(maxRaw);
          if (!Number.isFinite(v) || v < 0) throw new Error("Максимальный рейтинг должен быть числом ≥ 0");
          maxRating = Math.round(v);
        }
        if (minRating != null && maxRating != null && minRating > maxRating) {
          throw new Error("Минимальный рейтинг не может быть больше максимального");
        }
      }
      const created = await api.createEvent({
        title,
        date,
        startTime,
        endTime,
        format,
        pairingMode,
        courtsCount: courts,
        courtNames: courtNames.map((name, idx) => (name?.trim() ? name.trim() : `Корт ${idx + 1}`)),
        autoRounds,
        roundsPlanned: autoRounds ? undefined : rounds,
        scoringMode,
        pointsPerPlayerPerMatch: pointsPerPlayer,
        ...(scoringMode === "SETS"
          ? { setsPerMatch, gamesPerSet, tiebreakEnabled: true }
          : {}),
        visibility,
        minRating,
        maxRating,
        telegramChatIds: selectedTgChatIds.size > 0 ? Array.from(selectedTgChatIds) : undefined,
      });
      nav(`/events/${created.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <TooltipProvider>
        <div className="mx-auto max-w-3xl py-16 text-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4 pb-24">
        {/* Компактная шапка */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => nav(isEditing ? "/settings?tab=subscriptions" : "/games")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary hover:bg-secondary/70 transition-colors"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight truncate">
              {isEditing ? "Редактирование серии" : "Создать игру"}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {(title || "Игра")} · {recurring
                ? "серия"
                : new Date(date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}{" "}
              {startHour}:{startMinute}
            </p>
          </div>
          {!isEditing && (
            <div className="flex shrink-0 rounded-lg bg-secondary p-0.5">
              {[{ v: false, t: "Разовая" }, { v: true, t: "Серия" }].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setRecurring(o.v)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                    recurring === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {o.t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 1. Формат — слайдер + «i» */}
        {!recurring && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Формат</span>
              <button
                type="button"
                onClick={() => setShowFmtDesc((v) => !v)}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                  showFmtDesc ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
                aria-label="О формате"
              >
                <Info className="h-3 w-3" />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    "shrink-0 h-11 px-4 rounded-lg border-2 text-sm font-semibold transition-all",
                    format === f.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/50 text-muted-foreground hover:border-border/80",
                  )}
                >
                  {f.title}
                </button>
              ))}
            </div>
            {showFmtDesc && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {FORMATS.find((f) => f.id === format)?.desc}
              </p>
            )}
          </section>
        )}

        {/* 2. Система счёта — только там, где есть смысл в сетах */}
        {!recurring && format === "FIXED_PAIRS" && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Система счёта</span>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: "POINTS" as const, t: "Очки" }, { id: "SETS" as const, t: "Сеты" }].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setScoringMode(m.id)}
                  className={cn(
                    "h-11 rounded-lg border-2 text-sm font-semibold transition-all",
                    scoringMode === m.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/50 text-muted-foreground",
                  )}
                >
                  {m.t}
                </button>
              ))}
            </div>
            {scoringMode === "SETS" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Геймов в сете</Label>
                  <Select value={gamesPerSet.toString()} onValueChange={(v) => setGamesPerSet(Number(v))}>
                    <SelectTrigger className="bg-secondary border-border h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>{[4, 6, 8, 9].map((v) => <SelectItem key={v} value={v.toString()}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Сетов в матче</Label>
                  <Select value={setsPerMatch.toString()} onValueChange={(v) => setSetsPerMatch(Number(v))}>
                    <SelectTrigger className="bg-secondary border-border h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 сет</SelectItem>
                      <SelectItem value="3">До 2 побед</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 3. Основное */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">Основное</span>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm text-muted-foreground">Название</Label>
            <Input
              id="name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-secondary border-border h-11"
              placeholder="Название игры"
            />
          </div>

          {recurring ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Дни недели</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const sel = daysOfWeek.has(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() =>
                          setDaysOfWeek((prev) => {
                            const next = new Set(prev);
                            if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                            return next;
                          })
                        }
                        className={cn(
                          "h-10 rounded-md border-2 text-sm font-medium transition-all",
                          sel ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Открывать</Label>
                  <Select
                    value={materializeMode === "WEEKLY_SUNDAY" ? "weekly_sunday" : materializeHoursBefore.toString()}
                    onValueChange={(v) => {
                      if (v === "weekly_sunday") setMaterializeMode("WEEKLY_SUNDAY");
                      else { setMaterializeMode("HOURS_BEFORE"); setMaterializeHoursBefore(Number(v)); }
                    }}
                  >
                    <SelectTrigger className="bg-secondary border-border h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">за 1 день</SelectItem>
                      <SelectItem value="72">за 3 дня</SelectItem>
                      <SelectItem value="168">за неделю</SelectItem>
                      <SelectItem value="336">за 2 недели</SelectItem>
                      <SelectItem value="weekly_sunday">в конце недели</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Время анонса</Label>
                  <Select value={materializeAtHour.toString()} onValueChange={(v) => setMaterializeAtHour(Number(v))}>
                    <SelectTrigger className="bg-secondary border-border h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
                        <SelectItem key={h} value={h.toString()}>{h.toString().padStart(2, "0")}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Когда</Label>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="relative flex items-center gap-2 rounded-md border border-border bg-secondary px-3 h-11 cursor-pointer"
                  onClick={() => (document.getElementById("date-hidden") as HTMLInputElement)?.showPicker?.()}
                >
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">
                    {new Date(date + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <input
                    id="date-hidden"
                    type="date"
                    value={date}
                    onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 h-11">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={startHour} onValueChange={setStartHour}>
                    <SelectTrigger className="border-0 bg-transparent h-9 w-auto gap-1 px-1 text-sm font-semibold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString().padStart(2, "0")}>{i.toString().padStart(2, "0")}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground text-xs">–</span>
                  <Select value={endHour} onValueChange={setEndHour}>
                    <SelectTrigger className="border-0 bg-transparent h-9 w-auto gap-1 px-1 text-sm font-semibold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString().padStart(2, "0")}>{i.toString().padStart(2, "0")}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />Кортов
              </Label>
              <Select value={courts.toString()} onValueChange={(v) => setCourts(Number(v))}>
                <SelectTrigger className="bg-secondary border-border h-10 font-semibold"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-52">
                  {Array.from({ length: 12 }, (_, i) => <SelectItem key={i} value={(i + 1).toString()}>{i + 1}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {scoringMode === "POINTS" ? (
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-primary" />Подач на игрока
                </Label>
                <Select value={pointsPerPlayer.toString()} onValueChange={(v) => setPointsPerPlayer(Number(v))}>
                  <SelectTrigger className="bg-secondary border-border h-10 font-semibold"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-52">
                    {Array.from({ length: 20 }, (_, i) => <SelectItem key={i} value={(i + 1).toString()}>{i + 1}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : <div />}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Названия кортов</Label>
              <button
                type="button"
                onClick={() => setEditCourtNames((v) => !v)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                  editCourtNames ? "border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
                aria-label="Переименовать корты"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {courtNames.map((name, idx) =>
                editCourtNames ? (
                  <Input
                    key={`court-${idx}`}
                    value={name}
                    onChange={(e) => { const next = [...courtNames]; next[idx] = e.target.value; setCourtNames(next); }}
                    className="bg-secondary border-border h-10"
                    placeholder={`Корт ${String.fromCharCode(65 + idx)}`}
                  />
                ) : (
                  <div key={`court-${idx}`} className="flex items-center rounded-md border border-border bg-secondary px-3 h-10 text-sm font-medium">
                    {name || `Корт ${String.fromCharCode(65 + idx)}`}
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        {/* 4. Кто видит + уровень */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">Кто может видеть и играть</span>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: "PUBLIC" as EventVisibility, icon: Globe, t: "Открытая" }, { id: "PRIVATE" as EventVisibility, icon: Lock, t: "Приватная" }].map((o) => {
              const Icon = o.icon;
              const active = visibility === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setVisibility(o.id)}
                  className={cn(
                    "flex items-center justify-center gap-2 h-11 rounded-lg border-2 text-sm font-semibold transition-all",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />{o.t}
                </button>
              );
            })}
          </div>

          {!recurring && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">Ограничение по уровню</Label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ratingLimitEnabled}
                  aria-label="Ограничение по уровню"
                  onClick={() => setRatingLimitEnabled((v) => !v)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                    ratingLimitEnabled ? "bg-primary" : "bg-input",
                  )}
                >
                  <span className={cn("inline-block h-5 w-5 rounded-full bg-background shadow transition-transform", ratingLimitEnabled ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              {ratingLimitEnabled && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Тапни «от», затем «до»</div>
                  <div className="flex gap-1.5">
                    {LEVELS.map((L, i) => {
                      const inRange = i >= minLevelIdx && i <= maxLevelIdx;
                      const edge = i === minLevelIdx || i === maxLevelIdx;
                      return (
                        <button
                          key={L}
                          type="button"
                          onClick={() => {
                            if (levelAnchor === null) { setLevelAnchor(i); setMinLevelIdx(i); setMaxLevelIdx(i); }
                            else { setMinLevelIdx(Math.min(levelAnchor, i)); setMaxLevelIdx(Math.max(levelAnchor, i)); setLevelAnchor(null); }
                          }}
                          className={cn(
                            "flex-1 min-w-0 h-9 rounded-md border text-xs font-bold tabular-nums transition-all",
                            edge ? "border-primary bg-primary text-primary-foreground"
                              : inRange ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-secondary/50 text-muted-foreground",
                          )}
                        >
                          {L}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-center text-sm text-muted-foreground">
                    Уровень <b className="text-foreground">{LEVELS[minLevelIdx]}</b> — <b className="text-foreground">{LEVELS[maxLevelIdx]}</b>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 5. Раунды + анонс */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">Раунды и анонс</span>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: "auto" as const, t: "Авто" }, { id: "manual" as const, t: "Вручную" }].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setRoundsMode(m.id)}
                className={cn(
                  "h-11 rounded-lg border-2 text-sm font-semibold transition-all",
                  roundsMode === m.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground",
                )}
              >
                {m.t}
              </button>
            ))}
          </div>
          {roundsMode === "manual" && (
            <Input type="number" min={1} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="bg-secondary border-border h-11" />
          )}
          {telegramChats.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Анонс в Telegram</span>
              </div>
              {telegramChats.map((chat) => {
                const checked = selectedTgChatIds.has(chat.id);
                return (
                  <label key={chat.id} className="flex items-center gap-3 rounded-md bg-secondary/50 hover:bg-secondary px-3 py-2.5 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedTgChatIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(chat.id); else next.delete(chat.id);
                          return next;
                        })
                      }
                    />
                    <UsersIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{chat.title}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div>
        ) : null}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 h-12 bg-transparent" type="button" onClick={() => nav(isEditing ? "/settings?tab=subscriptions" : "/games")} disabled={loading}>
            Отменить
          </Button>
          <Button className="flex-1 h-12 bg-primary text-primary-foreground" size="lg" disabled={loading}>
            {loading ? "Сохраняем…" : isEditing ? "Сохранить" : "Создать игру"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">Минимум {minPlayers} игроков для старта</p>
      </form>
    </TooltipProvider>
  );
}
