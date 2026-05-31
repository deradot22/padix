import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gamepad2, Users, Clock, Calendar, Lightbulb, Users2, MapPin, Zap, Send, MessageCircle, Users as UsersIcon, Lock, Globe, Repeat } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, EventVisibility, PairingMode, TelegramChat } from "../../../lib/api";

function todayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function V0CreateEventPage(props: {
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
  const [courts, setCourts] = useState(2);
  const [courtNames, setCourtNames] = useState<string[]>(["Корт A", "Корт B"]);
  const [autoRounds, setAutoRounds] = useState(true);
  const [rounds, setRounds] = useState(6);
  const [pointsPerPlayer, setPointsPerPlayer] = useState(6);
  const [visibility, setVisibility] = useState<EventVisibility>("PUBLIC");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gameMode, setGameMode] = useState<"round_robin" | "balanced">("round_robin");
  const [roundsMode, setRoundsMode] = useState<"auto" | "manual">("auto");
  const [step] = useState(1);
  const [telegramChats, setTelegramChats] = useState<TelegramChat[]>([]);
  const [selectedTgChatIds, setSelectedTgChatIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const status = await api.getTelegramStatus();
        if (!status.enabled) return;
        const list = await api.getTelegramChats();
        // Личный чат автора в анонсе не нужен — он сам создаёт игру и про неё знает.
        // Личные напоминания о собственных играх (если автор зарегистрирован участником)
        // придут отдельно по reminder-cron.
        const groupOnly = list.filter((c) => c.chatType !== "PRIVATE");
        setTelegramChats(groupOnly);
        setSelectedTgChatIds(new Set(groupOnly.map((c) => c.id)));
      } catch {
        // тихо — фича опциональная
      }
    })();
  }, []);

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);

  // Edit-режим: подгружаем серию и заполняем форму её данными.
  useEffect(() => {
    if (!editSeriesId) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getEventSeries(editSeriesId);
        if (cancelled) return;
        setTitle(s.title);
        setDaysOfWeek(new Set(s.daysOfWeek.split(",").map((d) => d.trim()).filter(Boolean)));
        const [sh, sm] = s.startTime.slice(0, 5).split(":");
        const [eh, em] = s.endTime.slice(0, 5).split(":");
        setStartHour(sh); setStartMinute(sm);
        setEndHour(eh); setEndMinute(em);
        setCourts(s.courtsCount);
        setPointsPerPlayer(s.pointsPerPlayerPerMatch);
        setVisibility(s.visibility);
        setMaterializeHoursBefore(s.materializeHoursBefore);
        const matH = parseInt(s.materializeAtTime?.slice(0, 2) ?? "9", 10);
        if (!Number.isNaN(matH)) setMaterializeAtHour(matH);
        setMaterializeMode(s.materializeMode ?? "HOURS_BEFORE");
        setSeriesReminderHours(s.reminderHours ?? null);
        setSeriesPinAnnouncement(s.pinAnnouncement ?? null);
        // При редактировании отражаем РОВНО то, что сохранено: если пользователь раньше
        // выбрал конкретные группы — показываем их; если targetChatIds пуст (старые серии
        // на legacy-fallback «все группы») — НИЧЕГО не пред-выбираем, пусть пользователь
        // отметит явно, иначе всегда казалось «галки на все» и не было способа их снять.
        setSelectedTgChatIds(new Set(s.targetChatIds ?? []));
        setGameMode(s.pairingMode === "BALANCED" ? "balanced" : "round_robin");
      } catch (e: any) {
        setError(e?.message ?? "Не удалось загрузить подписку");
      }
    })();
    return () => { cancelled = true; };
  }, [editSeriesId]);

  useEffect(() => {
    setPairingMode(gameMode === "balanced" ? "BALANCED" : "ROUND_ROBIN");
  }, [gameMode]);

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
      const created = await api.createEvent({
        title,
        date,
        startTime,
        endTime,
        format: "AMERICANA",
        pairingMode,
        courtsCount: courts,
        courtNames: courtNames.map((name, idx) => (name?.trim() ? name.trim() : `Корт ${idx + 1}`)),
        autoRounds,
        roundsPlanned: autoRounds ? undefined : rounds,
        scoringMode: "POINTS",
        pointsPerPlayerPerMatch: pointsPerPlayer,
        visibility,
        telegramChatIds: selectedTgChatIds.size > 0 ? Array.from(selectedTgChatIds) : undefined,
      });
      nav(`/events/${created.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <TooltipProvider>
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-8">
        {isEditing ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => nav("/settings?tab=subscriptions")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← К подпискам
            </button>
            <h1 className="text-3xl font-bold tracking-tight">Редактирование подписки</h1>
            <p className="text-sm text-muted-foreground">
              Изменения применятся к следующим автоматически созданным играм. Уже созданные игры останутся без изменений.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Создание новой игры</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight">Организуйте игру в падел</h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Выберите время, место и параметры игры. Система автоматически подберёт оптимальные раунды и режим.
              </p>
            </div>

            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-all", s <= step ? "bg-primary" : "bg-secondary")} />
              ))}
            </div>

            {/* Тип: разовая или регулярная (подписка). От этого зависит, выбираем
                ли мы конкретную дату или дни недели + горизонт материализации. */}
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { id: false, icon: Calendar, title: "Разовая", desc: "Игра на конкретную дату." },
                { id: true, icon: Repeat, title: "Регулярная", desc: "Подписка: повторяется в выбранные дни недели." },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = recurring === opt.id;
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => setRecurring(opt.id)}
                    className={cn(
                      "relative rounded-lg border-2 p-4 text-left transition-all",
                      active ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                      <div className="font-semibold">{opt.title}</div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">{opt.desc}</div>
                    {active ? (
                      <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="space-y-6">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                1
              </span>
              Основная информация
            </h2>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="font-medium">
                    Название игры
                  </Label>
                  <Input
                    id="name"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-secondary border-border h-11"
                    placeholder="Например: Американка в понедельник"
                  />
                </div>

                {recurring ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-medium">Открывать регистрацию</Label>
                      <Select
                        value={materializeMode === "WEEKLY_SUNDAY" ? "weekly_sunday" : materializeHoursBefore.toString()}
                        onValueChange={(v) => {
                          if (v === "weekly_sunday") {
                            setMaterializeMode("WEEKLY_SUNDAY");
                          } else {
                            setMaterializeMode("HOURS_BEFORE");
                            setMaterializeHoursBefore(Number(v));
                          }
                        }}
                      >
                        <SelectTrigger className="bg-secondary border-border h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24">за 1 день до игры</SelectItem>
                          <SelectItem value="72">за 3 дня до игры</SelectItem>
                          <SelectItem value="168">за неделю до игры</SelectItem>
                          <SelectItem value="336">за 2 недели до игры</SelectItem>
                          <SelectItem value="weekly_sunday">в конце недели</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-medium">Время анонса</Label>
                      <Select
                        value={materializeAtHour.toString()}
                        onValueChange={(v) => setMaterializeAtHour(Number(v))}
                      >
                        <SelectTrigger className="bg-secondary border-border h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
                            <SelectItem key={h} value={h.toString()}>
                              {h.toString().padStart(2, "0")}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="date" className="font-medium">
                      Дата проведения
                    </Label>
                    <div
                      className="relative flex items-center gap-2 rounded-md border border-border bg-secondary px-3 h-11 cursor-pointer"
                      onClick={() => (document.getElementById("date-hidden") as HTMLInputElement)?.showPicker?.()}
                    >
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1">
                        {new Date(date + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </span>
                      <input
                        id="date-hidden"
                        type="date"
                        value={date}
                        onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {recurring && (
                <div className="space-y-2">
                  <Label className="font-medium">Дни недели</Label>
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {[
                      { id: "MON", label: "Пн" },
                      { id: "TUE", label: "Вт" },
                      { id: "WED", label: "Ср" },
                      { id: "THU", label: "Чт" },
                      { id: "FRI", label: "Пт" },
                      { id: "SAT", label: "Сб" },
                      { id: "SUN", label: "Вс" },
                    ].map((d) => {
                      const selected = daysOfWeek.has(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setDaysOfWeek((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                              return next;
                            });
                          }}
                          className={cn(
                            "h-10 rounded-md border-2 text-sm font-medium transition-all",
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-secondary/50 text-muted-foreground hover:border-border/80",
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Игра автоматически создаётся для каждой выбранной даты, регистрация открывается в заданный момент.
                  </p>
                </div>
              )}

              {recurring && (
                <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Уведомления этой серии
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Переопределяют глобальные настройки Telegram только для игр из этой серии.
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="text-sm sm:flex-1">Напоминание участникам</div>
                    <Select
                      value={seriesReminderHours === null ? "global" : String(seriesReminderHours)}
                      onValueChange={(v) =>
                        setSeriesReminderHours(v === "global" ? null : Number(v))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[200px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Как в общих настройках</SelectItem>
                        <SelectItem value="0">Не отправлять</SelectItem>
                        <SelectItem value="1">За 1 час</SelectItem>
                        <SelectItem value="2">За 2 часа</SelectItem>
                        <SelectItem value="6">За 6 часов</SelectItem>
                        <SelectItem value="24">За сутки</SelectItem>
                        <SelectItem value="48">За двое суток</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="text-sm sm:flex-1">Закреплять анонс в группах</div>
                    <Select
                      value={
                        seriesPinAnnouncement === null
                          ? "global"
                          : seriesPinAnnouncement
                            ? "yes"
                            : "no"
                      }
                      onValueChange={(v) =>
                        setSeriesPinAnnouncement(
                          v === "global" ? null : v === "yes" ? true : false,
                        )
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[200px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Как в общих настройках</SelectItem>
                        <SelectItem value="yes">Закреплять</SelectItem>
                        <SelectItem value="no">Не закреплять</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label className="font-medium">Время проведения</Label>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Начало</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <Select value={startHour} onValueChange={setStartHour}>
                        <SelectTrigger className="w-full bg-background border-primary/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString().padStart(2, "0")}>
                              {i.toString().padStart(2, "0")}ч
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center text-muted-foreground font-semibold">:</div>
                      <Select value={startMinute} onValueChange={setStartMinute}>
                        <SelectTrigger className="w-full bg-background border-primary/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["00", "15", "30", "45"].map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-accent/10 to-accent/5 rounded-xl p-5 border border-accent/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-accent" />
                      <span className="text-sm font-semibold text-foreground">Окончание</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <Select value={endHour} onValueChange={setEndHour}>
                        <SelectTrigger className="w-full bg-background border-accent/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString().padStart(2, "0")}>
                              {i.toString().padStart(2, "0")}ч
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center text-muted-foreground font-semibold">:</div>
                      <Select value={endMinute} onValueChange={setEndMinute}>
                        <SelectTrigger className="w-full bg-background border-accent/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["00", "15", "30", "45"].map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="courts" className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Количество кортов
                  </Label>
                  <Select value={courts.toString()} onValueChange={(value) => setCourts(Number(value))}>
                    <SelectTrigger id="courts" className="bg-secondary border-border h-10 text-sm font-semibold px-4 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-sm max-h-40 overflow-y-auto">
                      {Array.from({ length: 12 }, (_, i) => {
                        const value = (i + 1).toString();
                        return (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serves" className="font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Подач на игрока (POINTS)
                  </Label>
                  <Select value={pointsPerPlayer.toString()} onValueChange={(value) => setPointsPerPlayer(Number(value))}>
                    <SelectTrigger id="serves" className="bg-secondary border-border h-10 text-sm font-semibold px-4 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-sm max-h-72 overflow-y-auto">
                      {Array.from({ length: 20 }, (_, i) => {
                        const value = (i + 1).toString();
                        return (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 pt-2 md:col-span-2">
                  <div className="text-xs text-muted-foreground">Названия кортов</div>
                  <div className="grid gap-2 md:grid-cols-4">
                    {courtNames.map((name, idx) => (
                      <Input
                        key={`court-${idx}`}
                        value={name}
                        onChange={(e) => {
                          const next = [...courtNames];
                          next[idx] = e.target.value;
                          setCourtNames(next);
                        }}
                        className="bg-secondary border-border h-10"
                        placeholder={`Корт ${String.fromCharCode(65 + idx)}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 rounded-lg border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <Users className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
                <p className="text-amber-800 dark:text-amber-200">
                  <strong>Минимум {minPlayers} игроков</strong> требуется для старта игры
                </p>
              </div>
            </div>

            <div className="border-t border-border pt-8 space-y-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  2
                </span>
                Правила игры
              </h2>

              <div className="space-y-3">
                <Label className="font-medium flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-primary" />
                  Режим американки
                </Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "round_robin" as const, title: "Каждый с каждым", desc: "Все играют со всеми в случайном порядке" },
                    { id: "balanced" as const, title: "Равный бой", desc: "Система подбирает пары с близким рейтингом" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setGameMode(mode.id)}
                      className={cn(
                        "relative rounded-lg border-2 p-4 text-left transition-all",
                        gameMode === mode.id ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                      )}
                    >
                      <div className="font-semibold">{mode.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">{mode.desc}</div>
                      {gameMode === mode.id ? (
                        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-medium">Видимость</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "PUBLIC" as EventVisibility, icon: Globe, title: "Открытая", desc: "Видна всем в /games. Любой может записаться. По умолчанию." },
                    { id: "PRIVATE" as EventVisibility, icon: Lock, title: "Приватная", desc: "В /games видна, но детали (состав, раунды) — только участникам, приглашённым и автору." },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = visibility === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setVisibility(opt.id)}
                        className={cn(
                          "relative rounded-lg border-2 p-4 text-left transition-all",
                          active ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                          <div className="font-semibold">{opt.title}</div>
                        </div>
                        <div className="text-sm text-muted-foreground mt-2">{opt.desc}</div>
                        {active ? (
                          <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                            <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-medium">Раунды</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "auto" as const, title: "Автоматически", desc: "Система подберёт оптимальное число раундов" },
                    { id: "manual" as const, title: "Вручную", desc: "Вы укажете количество раундов сами" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setRoundsMode(mode.id)}
                      className={cn(
                        "relative rounded-lg border-2 p-4 text-left transition-all",
                        roundsMode === mode.id ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                      )}
                    >
                      <div className="font-semibold">{mode.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">{mode.desc}</div>
                      {roundsMode === mode.id ? (
                        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
                {roundsMode === "manual" ? (
                  <Input type="number" min={1} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="bg-secondary border-border h-11" />
                ) : (
                  <div className="text-sm text-muted-foreground">Количество раундов будет рассчитано автоматически при старте игры.</div>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-8 space-y-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  3
                </span>
                Подтверждение
              </h2>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Дата и время</div>
                  <div className="font-semibold text-lg">{date}</div>
                  <div className="text-sm text-muted-foreground">
                    {startHour}:{startMinute} - {endHour}:{endMinute}
                  </div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Кортов</div>
                  <div className="font-semibold text-lg">{courts} корта</div>
                  <div className="text-sm text-muted-foreground">{minPlayers}+ игроков</div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Режим</div>
                  <div className="font-semibold text-lg">{gameMode === "balanced" ? "Равный бой" : "Каждый с каждым"}</div>
                  <div className="text-sm text-muted-foreground">{gameMode === "balanced" ? "Оптимально" : "Классика"}</div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Подачи</div>
                  <div className="font-semibold text-lg">{pointsPerPlayer} подач на игрока</div>
                </div>
              </div>

              {telegramChats.length > 0 && (
                <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <div className="text-sm font-medium">Отправить анонс в Telegram</div>
                  </div>
                  <div className="space-y-2">
                    {telegramChats.map((chat) => {
                      const checked = selectedTgChatIds.has(chat.id);
                      const Icon = chat.chatType === "PRIVATE" ? MessageCircle : chat.chatType === "CHANNEL" ? Send : UsersIcon;
                      return (
                        <label
                          key={chat.id}
                          className="flex items-center gap-3 rounded-md bg-background/60 hover:bg-background px-3 py-2 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-sky-500"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedTgChatIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(chat.id);
                                else next.delete(chat.id);
                                return next;
                              });
                            }}
                          />
                          <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                          <span className="text-sm flex-1 truncate">{chat.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 h-12 bg-transparent" type="button" onClick={() => nav("/games")} disabled={loading}>
                  Отменить
                </Button>
                <Button className="flex-1 h-12 bg-primary text-primary-foreground" size="lg" disabled={loading}>
                  <Gamepad2 className="mr-2 h-5 w-5" />
                  {loading ? "Сохраняем…" : isEditing ? "Сохранить подписку" : "Создать игру"}
                </Button>
              </div>

            {error ? (
              <CardContent className="px-0">
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
              </CardContent>
            ) : null}
          </div>
        </div>
      </form>
    </TooltipProvider>
  );
}

