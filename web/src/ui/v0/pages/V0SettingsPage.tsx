import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, EventSeries, MeResponse, TelegramChat, TelegramSettings, TelegramStatus } from "../../../lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TelegramIntegrationCard } from "@/components/telegram-integration";
import { ConnectedAccountsSection } from "@/components/connected-accounts-section";
import { User, Bell, ShieldCheck, Upload, Check, Send, ChevronLeft, ChevronRight, BellOff, BellRing, Repeat, Pause, Play, Trash2, Plus, Pencil } from "lucide-react";

type SectionId = "profile" | "notifications" | "subscriptions" | "security";

const SECTIONS: { id: SectionId; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Профиль", icon: User },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "subscriptions", label: "Подписки", icon: Repeat },
  { id: "security", label: "Безопасность", icon: ShieldCheck },
];

function isSectionId(v: string | null): v is SectionId {
  return v === "profile" || v === "notifications" || v === "subscriptions" || v === "security";
}

export function V0SettingsPage(props: {
  me: any;
  meLoaded?: boolean;
  onMeUpdate?: (me: MeResponse) => void;
}) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [section, setSection] = useState<SectionId>(isSectionId(tabFromUrl) ? tabFromUrl : "profile");

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
  }, [props.me, props.meLoaded, nav]);

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
          {section === "profile" && (
            <ProfileSection me={props.me} onMeUpdate={props.onMeUpdate} />
          )}
          {section === "notifications" && <NotificationsSection />}
          {section === "subscriptions" && <SubscriptionsSection />}
          {section === "security" && (
            <div className="space-y-6">
              {props.me ? (
                <ConnectedAccountsSection me={props.me} onMeUpdate={props.onMeUpdate ?? (() => {})} />
              ) : null}
              <SecuritySection />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Profile section ----------

const BOY_AVATARS = [
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy1",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy2",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy3",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy4",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy5",
];
const GIRL_AVATARS = [
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl1",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl2",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl3",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl4",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl5",
];

function compressAvatar(file: File, maxSize = 256, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Нет контекста canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function ProfileSection(props: {
  me: any;
  onMeUpdate?: (me: MeResponse) => void;
}) {
  const [me, setMe] = useState<MeResponse | null>(props.me ?? null);
  const [name, setName] = useState(props.me?.name ?? "");
  const [email, setEmail] = useState(props.me?.email ?? "");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState(props.me?.gender ?? "");
  const [avatar, setAvatar] = useState<string | null>(props.me?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.me) {
      setMe(props.me);
      setName(props.me.name ?? "");
      setEmail(props.me.email ?? "");
      setGender(props.me.gender ?? "");
      setAvatar(props.me.avatarUrl ?? null);
    }
  }, [props.me]);

  const dirty = useMemo(() => {
    if (!me) return false;
    return (
      name.trim() !== (me.name ?? "") ||
      email.trim() !== (me.email ?? "") ||
      gender !== (me.gender ?? "") ||
      password.length > 0
    );
  }, [me, name, email, gender, password]);

  const persistAvatar = async (next: string | null) => {
    setAvatar(next);
    try {
      const updated = await api.updateAvatar(next);
      setMe(updated);
      props.onMeUpdate?.(updated);
      setInfo("Аватар обновлён");
      window.setTimeout(() => setInfo(null), 1500);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось обновить аватар");
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const payload: { name?: string; email?: string; password?: string; gender?: string } = {};
      if (name.trim() && name.trim() !== (me?.name ?? "")) payload.name = name.trim();
      if (email.trim() && email.trim() !== (me?.email ?? "")) payload.email = email.trim();
      if (password) payload.password = password;
      if (gender !== (me?.gender ?? "")) payload.gender = gender;
      if (Object.keys(payload).length === 0) {
        setInfo("Нечего сохранять");
        return;
      }
      const updated = await api.updateProfile(payload);
      setMe(updated);
      props.onMeUpdate?.(updated);
      setPassword("");
      setInfo("Сохранено");
      window.setTimeout(() => setInfo(null), 1500);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (!me) return null;
  const initials = me.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Профиль</CardTitle>
        <CardDescription>Имя, email, пароль и аватар.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Аватар</div>
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-xl font-semibold shrink-0">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="space-y-3 flex-1">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary transition-colors">
                <Upload className="h-3.5 w-3.5" />
                Загрузить фото
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    compressAvatar(file)
                      .then(persistAvatar)
                      .catch((err: any) => setError(err?.message ?? "Ошибка обработки"));
                  }}
                />
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[...BOY_AVATARS, ...GIRL_AVATARS].map((src) => (
                  <button
                    key={src}
                    type="button"
                    className={cn(
                      "h-10 w-10 rounded-full border transition-all",
                      avatar === src ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40"
                    )}
                    onClick={() => persistAvatar(src)}
                  >
                    <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="space-y-2">
            <label className="text-sm font-medium">Имя</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Новый пароль</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Оставьте пустым, чтобы не менять"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Пол</label>
            <Select value={gender || "_unset"} onValueChange={(v) => setGender(v === "_unset" ? "" : v)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_unset">Не указан</SelectItem>
                <SelectItem value="M">М</SelectItem>
                <SelectItem value="F">Ж</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Шансы выигрыша — отдельный auto-save тоггл (одноклик, не привязан к Save). */}
          <label className="flex items-start justify-between gap-3 cursor-pointer rounded-md border border-border bg-background/50 hover:bg-background px-3 py-2.5 transition-colors">
            <div className="space-y-0.5 min-w-0">
              <div className="text-sm font-medium">Показывать шансы выигрыша</div>
              <div className="text-xs text-muted-foreground">
                В модале «Раунды» под каждым матчем будет полоска шансов и метка «Лёгкий фаворит» / «Равные шансы» и т.п. По Elo.
              </div>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary shrink-0"
              checked={me.showWinProbability === true}
              onChange={async (e) => {
                const next = e.target.checked;
                setError(null);
                try {
                  const updated = await api.updateProfile({ showWinProbability: next });
                  setMe(updated);
                  props.onMeUpdate?.(updated);
                } catch (err: any) {
                  setError(err?.message ?? "Не удалось сохранить настройку");
                }
              }}
            />
          </label>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {info}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={saving || !dirty}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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

// ---------- Security section ----------

function SecuritySection() {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Безопасность</CardTitle>
        <CardDescription>Управление сессиями и удаление аккаунта.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Скоро здесь появятся: выход из всех сессий, 2FA, удаление аккаунта.
        </div>
      </CardContent>
    </Card>
  );
}
