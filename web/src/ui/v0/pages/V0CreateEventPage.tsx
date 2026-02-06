import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gamepad2, Users, Clock, Calendar, Lightbulb, Users2, MapPin, Zap } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, PairingMode } from "../../../lib/api";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gameMode, setGameMode] = useState<"round_robin" | "balanced">("round_robin");
  const [roundsMode, setRoundsMode] = useState<"auto" | "manual">("auto");
  const [step] = useState(1);

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);

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
      const startDt = new Date(`${date}T${startTime}`);
      const endDt = new Date(`${date}T${endTime}`);
      if (Number.isNaN(startDt.getTime()) || startDt.getTime() < Date.now()) {
        throw new Error("Дата и время должны быть в будущем");
      }
      if (Number.isNaN(endDt.getTime()) || endDt.getTime() <= startDt.getTime()) {
        throw new Error("Время окончания должно быть позже начала");
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

                <div className="space-y-2">
                  <Label htmlFor="date" className="font-medium">
                    Дата проведения
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-secondary border-border pl-10 h-11" />
                  </div>
                </div>
              </div>

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

              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <Users className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-amber-200">
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

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 h-12 bg-transparent" type="button" onClick={() => nav("/games")} disabled={loading}>
                  Отменить
                </Button>
                <Button className="flex-1 h-12 bg-primary text-primary-foreground" size="lg" disabled={loading}>
                  <Gamepad2 className="mr-2 h-5 w-5" />
                  {loading ? "Создаём…" : "Создать игру"}
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

