import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, EventSeries, MeResponse, TelegramChat, TelegramSettings, TelegramStatus } from "../../../lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TelegramIntegrationCard } from "@/components/telegram-integration";
import { ConnectedAccountsSection } from "@/components/connected-accounts-section";
import { PasswordSection } from "@/components/password-section";
import { User, Bell, Link2, ShieldCheck, Upload, Check, Send, ChevronLeft, ChevronRight, BellOff, BellRing, Repeat, Pause, Play, Trash2, Plus, Pencil } from "lucide-react";

type SectionId = "notifications" | "subscriptions" | "integrations" | "security";

const SECTIONS: { id: SectionId; label: string; icon: typeof User }[] = [
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "subscriptions", label: "Подписки", icon: Repeat },
  { id: "integrations", label: "Интеграции", icon: Link2 },
  { id: "security", label: "Безопасность", icon: ShieldCheck },
];

function isSectionId(v: string | null): v is SectionId {
  return v === "notifications" || v === "subscriptions" || v === "integrations" || v === "security";
}

export function V0SettingsPage(props: {
  me: any;
  meLoaded?: boolean;
  onMeUpdate?: (me: MeResponse) => void;
}) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [section, setSection] = useState<SectionId>(isSectionId(tabFromUrl) ? tabFromUrl : "notifications");

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
  }, [props.me, props.meLoaded, nav]);

  // Старые ссылки ?tab=profile теперь редиректятся на /profile (карандашик там).
  useEffect(() => {
    if (tabFromUrl === "profile") nav("/profile", { replace: true });
  }, [tabFromUrl, nav]);

  useEffect(() => {
    const cur = searchParams.get("tab");
    if (cur !== section) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", section);
      setSearchParams(next, { replace: true });
    }
  }, [section, searchParams, setSearchParams]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="text-sm text-muted-foreground">Аккаунт, уведомления и безопасность.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Mobile: pill-tabs в общем контейнере. Десктоп: вертикальный sidebar. */}
        <nav className="md:sticky md:top-20 self-start">
          <div className="md:hidden grid grid-cols-4 gap-1 rounded-lg bg-secondary/40 p-1">
            {SECTIONS.map(({ id, label }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={cn(
                    "min-w-0 rounded-md px-1 py-2 text-xs transition-colors text-center truncate",
                    active
                      ? "bg-background text-foreground font-medium shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <ul className="hidden md:flex md:flex-col gap-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setSection(id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm w-full transition-colors",
                      active
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-6 min-w-0">
          {section === "notifications" && <NotificationsSection />}
          {section === "subscriptions" && <SubscriptionsSection />}
          {section === "integrations" && (
            <div className="space-y-6">
              {props.me ? (
                <ConnectedAccountsSection me={props.me} onMeUpdate={props.onMeUpdate ?? (() => {})} />
              ) : null}
            </div>
          )}
          {section === "security" && (
            <div className="space-y-6">
              {props.me ? (
                <PasswordSection me={props.me} onMeUpdate={props.onMeUpdate ?? (() => {})} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Notifications section ----------

type Channel = "telegram";

function NotificationsSection() {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getTelegramStatus();
        if (cancelled) return;
        setStatus(s);
        if (!s.enabled) return;
        const [chatList, currentSettings] = await Promise.all([
          api.getTelegramChats(),
          api.getTelegramSettings(),
        ]);
        if (cancelled) return;
        setChats(chatList);
        setSettings(currentSettings);
      } catch {
        // тихо — карта Telegram внутри покажет ошибку
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTick, channel]);

  if (channel === "telegram") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setChannel(null);
            setRefreshTick((t) => t + 1);
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          К списку каналов
        </button>
        <TelegramIntegrationCard />
      </div>
    );
  }

  const tgEnabled = status?.enabled === true;
  const privateChat = chats.find((c) => c.chatType === "PRIVATE");
  const personalRemindersOn =
    tgEnabled && settings?.enabled === true && !!privateChat && privateChat.notifyReminder === true;
  const groupChatsCount = chats.filter((c) => c.chatType !== "PRIVATE").length;

  return (
    <div className="space-y-4">
      <PersonalRemindersCard
        loaded={status !== null}
        on={personalRemindersOn}
        tgEnabled={tgEnabled}
        privateChat={privateChat ?? null}
        reminderHours={settings?.reminderHours ?? 0}
        onConfigure={() => setChannel("telegram")}
      />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Каналы уведомлений</CardTitle>
          <CardDescription>Где вы хотите получать уведомления о играх.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChannelButton
              icon={<Send className="h-6 w-6 text-sky-600 dark:text-sky-400" />}
              title="Telegram"
              subtitle={
                tgEnabled
                  ? chats.length > 0
                    ? `${chats.length} ${chatsPlural(chats.length)} привязан${chats.length === 1 ? "" : "о"}`
                    : "Не подключено"
                  : "Интеграция выключена на сервере"
              }
              connected={tgEnabled && chats.length > 0}
              onClick={() => setChannel("telegram")}
              disabled={!tgEnabled}
            />
            {/* Будущие каналы: WhatsApp, Email, Push — добавляются сюда. */}
          </div>
          {tgEnabled && groupChatsCount > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              Анонсы новых игр, изменения и финал — идут в групповые чаты (их {groupChatsCount}).
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function chatsPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "чат";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "чата";
  return "чатов";
}

function PersonalRemindersCard(props: {
  loaded: boolean;
  on: boolean;
  tgEnabled: boolean;
  privateChat: TelegramChat | null;
  reminderHours: number;
  onConfigure: () => void;
}) {
  if (!props.loaded || !props.tgEnabled) return null;

  if (props.on) {
    const hours = props.reminderHours;
    const hoursLabel =
      hours === 1 ? "за 1 час" : hours === 24 ? "за сутки" : `за ${hours} часов`;
    return (
      <div className="rounded-lg border border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <BellRing className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Личные напоминания включены</div>
              <div className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-1">
                Бот пришлёт в личный чат напоминание {hoursLabel} до старта каждой игры,
                в которую вы зарегистрированы.
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={props.onConfigure} className="self-end sm:self-auto shrink-0">
            Изменить
          </Button>
        </div>
      </div>
    );
  }

  // Off
  const reason = !props.privateChat
    ? "Личный чат с ботом не привязан."
    : props.reminderHours <= 0
      ? "В настройках выключено время напоминания."
      : !props.privateChat.notifyReminder
        ? "У личного чата выключен чекбокс «напоминание»."
        : "Уведомления полностью выключены.";

  return (
    <div className="rounded-lg border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <BellOff className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-800 dark:text-amber-200">Личные напоминания не настроены</div>
            <div className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">{reason}</div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent self-end sm:self-auto shrink-0"
          onClick={props.onConfigure}
        >
          Настроить
        </Button>
      </div>
    </div>
  );
}

function ChannelButton(props: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  connected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
        props.disabled
          ? "border-border/50 bg-secondary/10 opacity-60 cursor-not-allowed"
          : "border-border bg-secondary/30 hover:bg-secondary/60"
      )}
    >
      <div className="shrink-0">{props.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium flex items-center gap-2">
          {props.title}
          {props.connected && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">
              <Check className="h-3 w-3" />
              подключено
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground line-clamp-2">{props.subtitle}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ---------- Subscriptions section ----------

const DAY_LABELS: Record<string, string> = {
  MON: "Пн", TUE: "Вт", WED: "Ср", THU: "Чт", FRI: "Пт", SAT: "Сб", SUN: "Вс",
};

function formatDays(csv: string): string {
  return csv
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean)
    .map((d) => DAY_LABELS[d] ?? d)
    .join(" · ");
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

function hoursLabel(h: number): string {
  if (h === 24) return "за 1 день";
  if (h === 72) return "за 3 дня";
  if (h === 168) return "за неделю";
  if (h === 336) return "за 2 недели";
  return `за ${h} ч`;
}

function SubscriptionsSection() {
  const nav = useNavigate();
  const [items, setItems] = useState<EventSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirm = useConfirm();

  const reload = async () => {
    try {
      const list = await api.listEventSeries();
      setItems(list);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить подписки");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const togglePause = async (s: EventSeries) => {
    setBusyId(s.id);
    try {
      const updated = s.active ? await api.pauseEventSeries(s.id) : await api.resumeEventSeries(s.id);
      setItems((prev) => (prev ?? []).map((x) => (x.id === s.id ? updated : x)));
    } catch (e: any) {
      setError(e?.message ?? "Не удалось обновить");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: EventSeries) => {
    const ok = await confirm({
      title: "Удалить подписку?",
      description: (
        <>
          Подписка <b>{s.title}</b> будет удалена. Уже созданные ею игры останутся —
          их можно удалить вручную через страницу игры.
        </>
      ),
      confirmLabel: "Удалить",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    setBusyId(s.id);
    try {
      await api.deleteEventSeries(s.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== s.id));
    } catch (e: any) {
      setError(e?.message ?? "Не удалось удалить");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Подписки на регулярные игры</CardTitle>
            <CardDescription>
              Шаблоны, по которым система автоматически создаёт игры в выбранные дни недели.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => nav("/create?recurring=1")} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Создать</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div>
        )}

        {items === null ? (
          <div className="text-sm text-muted-foreground">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            У вас пока нет подписок.
            <div className="mt-3">
              <Button variant="outline" className="bg-transparent" onClick={() => nav("/create?recurring=1")}>
                <Plus className="h-4 w-4 mr-1" /> Создать первую
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((s) => {
              const dimmed = !s.active;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg bg-secondary/50 p-3 space-y-2 border border-border",
                    dimmed && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Repeat className="h-4 w-4 text-primary shrink-0 mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{s.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDays(s.daysOfWeek)} · {formatTime(s.startTime)}–{formatTime(s.endTime)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span>Кортов: {s.courtsCount}</span>
                        <span>·</span>
                        <span>Анонс {hoursLabel(s.materializeHoursBefore)} в {formatTime(s.materializeAtTime)}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          {s.visibility === "PUBLIC" ? (<><Bell className="h-3 w-3" /> Открытая</>) : (<><ShieldCheck className="h-3 w-3" /> Приватная</>)}
                        </span>
                        {!s.active && (
                          <>
                            <span>·</span>
                            <span className="text-amber-700 dark:text-amber-300">На паузе</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-7">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-transparent h-8"
                      onClick={() => nav(`/create?recurring=1&editSeries=${s.id}`)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Изменить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-transparent h-8"
                      disabled={busyId === s.id}
                      onClick={() => togglePause(s)}
                    >
                      {s.active ? (
                        <>
                          <Pause className="h-3.5 w-3.5 mr-1" />
                          Пауза
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Возобновить
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/10"
                      disabled={busyId === s.id}
                      onClick={() => remove(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Удалить
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
