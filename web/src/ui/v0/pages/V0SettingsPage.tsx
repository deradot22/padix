import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, EventSeries, MeResponse, TelegramChat, TelegramSettings, TelegramStatus } from "../../../lib/api";
import { cn } from "@/lib/utils";
import { Dict, Lang, plural, useI18n, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TelegramIntegrationCard } from "@/components/telegram-integration";
import { ConnectedAccountsSection } from "@/components/connected-accounts-section";
import { PasswordSection } from "@/components/password-section";
import { User, Bell, Link2, ShieldCheck, Upload, Check, Send, ChevronLeft, ChevronRight, BellOff, BellRing, Repeat, Pause, Play, Trash2, Plus, Pencil, Globe } from "lucide-react";

const TR = {
  "page.title": { ru: "Настройки", en: "Settings" },
  "page.subtitle": { ru: "Аккаунт, уведомления и безопасность.", en: "Account, notifications and security." },
  "sections.general": { ru: "Общие", en: "General" },
  "sections.notifications": { ru: "Уведомления", en: "Notifications" },
  "sections.subscriptions": { ru: "Подписки", en: "Subscriptions" },
  "sections.integrations": { ru: "Интеграции", en: "Integrations" },
  "sections.security": { ru: "Безопасность", en: "Security" },
  "general.langTitle": { ru: "Язык / Language", en: "Language / Язык" },
  "general.langDesc": {
    ru: "Язык интерфейса. Применяется сразу и запоминается на этом устройстве.",
    en: "Interface language. Applies instantly and is remembered on this device.",
  },
  "notif.backToChannels": { ru: "К списку каналов", en: "Back to channel list" },
  "notif.channelsTitle": { ru: "Каналы уведомлений", en: "Notification channels" },
  "notif.channelsDesc": { ru: "Где вы хотите получать уведомления о играх.", en: "Where you want to receive game notifications." },
  "notif.notConnected": { ru: "Не подключено", en: "Not connected" },
  "notif.tgDisabledOnServer": { ru: "Интеграция выключена на сервере", en: "Integration is disabled on the server" },
  "notif.connectedBadge": { ru: "подключено", en: "connected" },
  "notif.groupChatsNote": {
    ru: "Анонсы новых игр, изменения и финал — идут в групповые чаты (их {n}).",
    en: "New game announcements, changes and finals go to the group chats ({n} of them).",
  },
  "notif.hours1": { ru: "за 1 час", en: "1 hour" },
  "notif.hours24": { ru: "за сутки", en: "a day" },
  "notif.hoursN": { ru: "за {n} часов", en: "{n} hours" },
  "notif.remindersOnTitle": { ru: "Личные напоминания включены", en: "Personal reminders are on" },
  "notif.remindersOnDesc": {
    ru: "Бот пришлёт в личный чат напоминание {when} до старта каждой игры, в которую вы зарегистрированы.",
    en: "The bot will send a reminder to your private chat {when} before the start of every game you are registered for.",
  },
  "notif.remindersOffTitle": { ru: "Личные напоминания не настроены", en: "Personal reminders are not set up" },
  "notif.reasonNoPrivateChat": { ru: "Личный чат с ботом не привязан.", en: "Private chat with the bot is not linked." },
  "notif.reasonNoHours": { ru: "В настройках выключено время напоминания.", en: "Reminder time is turned off in the settings." },
  "notif.reasonNoFlag": { ru: "У личного чата выключен чекбокс «напоминание».", en: "The \"reminder\" checkbox is off for the private chat." },
  "notif.reasonAllOff": { ru: "Уведомления полностью выключены.", en: "Notifications are turned off entirely." },
  "notif.configure": { ru: "Настроить", en: "Set up" },
  "common.edit": { ru: "Изменить", en: "Edit" },
  "common.delete": { ru: "Удалить", en: "Delete" },
  "common.loading": { ru: "Загрузка…", en: "Loading…" },
  "series.title": { ru: "Подписки на регулярные игры", en: "Recurring game subscriptions" },
  "series.desc": {
    ru: "Шаблоны, по которым система автоматически создаёт игры в выбранные дни недели.",
    en: "Templates the system uses to create games automatically on the selected days of the week.",
  },
  "series.create": { ru: "Создать", en: "Create" },
  "series.empty": { ru: "У вас пока нет подписок.", en: "You don't have any subscriptions yet." },
  "series.createFirst": { ru: "Создать первую", en: "Create the first one" },
  "series.courts": { ru: "Кортов: {n}", en: "Courts: {n}" },
  "series.announce": { ru: "Анонс {when} в {time}", en: "Announcement {when} at {time}" },
  "series.ann1d": { ru: "за 1 день", en: "1 day ahead" },
  "series.ann3d": { ru: "за 3 дня", en: "3 days ahead" },
  "series.annWeek": { ru: "за неделю", en: "a week ahead" },
  "series.ann2w": { ru: "за 2 недели", en: "2 weeks ahead" },
  "series.annHours": { ru: "за {n} ч", en: "{n} h ahead" },
  "series.public": { ru: "Открытая", en: "Public" },
  "series.private": { ru: "Приватная", en: "Private" },
  "series.paused": { ru: "На паузе", en: "Paused" },
  "series.pause": { ru: "Пауза", en: "Pause" },
  "series.resume": { ru: "Возобновить", en: "Resume" },
  "series.deleteTitle": { ru: "Удалить подписку?", en: "Delete subscription?" },
  "series.deleteDesc1": { ru: "Подписка", en: "Subscription" },
  "series.deleteDesc2": {
    ru: "будет удалена. Уже созданные ею игры останутся — их можно удалить вручную через страницу игры.",
    en: "will be deleted. Games it has already created will remain — you can delete them manually from the game page.",
  },
  "series.loadError": { ru: "Не удалось загрузить подписки", en: "Failed to load subscriptions" },
  "series.updateError": { ru: "Не удалось обновить", en: "Failed to update" },
  "series.deleteError": { ru: "Не удалось удалить", en: "Failed to delete" },
} satisfies Dict;

type SectionId = "general" | "notifications" | "subscriptions" | "integrations" | "security";

const SECTIONS: { id: SectionId; label: keyof typeof TR & string; icon: typeof User }[] = [
  { id: "general", label: "sections.general", icon: Globe },
  { id: "notifications", label: "sections.notifications", icon: Bell },
  { id: "subscriptions", label: "sections.subscriptions", icon: Repeat },
  { id: "integrations", label: "sections.integrations", icon: Link2 },
  { id: "security", label: "sections.security", icon: ShieldCheck },
];

function isSectionId(v: string | null): v is SectionId {
  return v === "general" || v === "notifications" || v === "subscriptions" || v === "integrations" || v === "security";
}

export function V0SettingsPage(props: {
  me: any;
  meLoaded?: boolean;
  onMeUpdate?: (me: MeResponse) => void;
}) {
  const nav = useNavigate();
  const { t } = useI18n(TR);
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
        <h1 className="text-2xl font-bold tracking-tight">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Mobile: pill-tabs в общем контейнере. Десктоп: вертикальный sidebar. */}
        <nav className="md:sticky md:top-20 self-start">
          <div className="md:hidden grid grid-cols-5 gap-1 rounded-lg bg-secondary/40 p-1">
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
                  {t(label)}
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
                    {t(label)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-6 min-w-0">
          {section === "general" && <GeneralSection />}
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

// ---------- General section (язык интерфейса) ----------

function GeneralSection() {
  const { t, lang } = useI18n(TR);
  const { setLang } = useLang();
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>{t("general.langTitle")}</CardTitle>
        <CardDescription>{t("general.langDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="inline-flex gap-1 rounded-lg bg-secondary/40 p-1">
          {([["ru", "Русский"], ["en", "English"]] as const).map(([code, label]) => {
            const active = lang === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition-colors",
                  active
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Notifications section ----------

type Channel = "telegram";

function NotificationsSection() {
  const { t, lang } = useI18n(TR);
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
          {t("notif.backToChannels")}
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
          <CardTitle>{t("notif.channelsTitle")}</CardTitle>
          <CardDescription>{t("notif.channelsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChannelButton
              icon={<Send className="h-6 w-6 text-sky-600 dark:text-sky-400" />}
              title="Telegram"
              subtitle={
                tgEnabled
                  ? chats.length > 0
                    ? `${chats.length} ${plural(lang, chats.length, ["чат привязан", "чата привязано", "чатов привязано"], ["chat linked", "chats linked"])}`
                    : t("notif.notConnected")
                  : t("notif.tgDisabledOnServer")
              }
              connected={tgEnabled && chats.length > 0}
              onClick={() => setChannel("telegram")}
              disabled={!tgEnabled}
            />
            {/* Будущие каналы: WhatsApp, Email, Push — добавляются сюда. */}
          </div>
          {tgEnabled && groupChatsCount > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              {t("notif.groupChatsNote", { n: groupChatsCount })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalRemindersCard(props: {
  loaded: boolean;
  on: boolean;
  tgEnabled: boolean;
  privateChat: TelegramChat | null;
  reminderHours: number;
  onConfigure: () => void;
}) {
  const { t } = useI18n(TR);
  if (!props.loaded || !props.tgEnabled) return null;

  if (props.on) {
    const hours = props.reminderHours;
    const hoursLabel =
      hours === 1 ? t("notif.hours1") : hours === 24 ? t("notif.hours24") : t("notif.hoursN", { n: hours });
    return (
      <div className="rounded-lg border border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <BellRing className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">{t("notif.remindersOnTitle")}</div>
              <div className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-1">
                {t("notif.remindersOnDesc", { when: hoursLabel })}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={props.onConfigure} className="self-end sm:self-auto shrink-0">
            {t("common.edit")}
          </Button>
        </div>
      </div>
    );
  }

  // Off
  const reason = !props.privateChat
    ? t("notif.reasonNoPrivateChat")
    : props.reminderHours <= 0
      ? t("notif.reasonNoHours")
      : !props.privateChat.notifyReminder
        ? t("notif.reasonNoFlag")
        : t("notif.reasonAllOff");

  return (
    <div className="rounded-lg border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <BellOff className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-800 dark:text-amber-200">{t("notif.remindersOffTitle")}</div>
            <div className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">{reason}</div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent self-end sm:self-auto shrink-0"
          onClick={props.onConfigure}
        >
          {t("notif.configure")}
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
  const { t } = useI18n(TR);
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
              {t("notif.connectedBadge")}
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

const DAY_LABELS: Record<string, { ru: string; en: string }> = {
  MON: { ru: "Пн", en: "Mon" },
  TUE: { ru: "Вт", en: "Tue" },
  WED: { ru: "Ср", en: "Wed" },
  THU: { ru: "Чт", en: "Thu" },
  FRI: { ru: "Пт", en: "Fri" },
  SAT: { ru: "Сб", en: "Sat" },
  SUN: { ru: "Вс", en: "Sun" },
};

function formatDays(csv: string, lang: Lang): string {
  return csv
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean)
    .map((d) => DAY_LABELS[d]?.[lang] ?? d)
    .join(" · ");
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

function hoursLabel(h: number, lang: Lang): string {
  if (h === 24) return TR["series.ann1d"][lang];
  if (h === 72) return TR["series.ann3d"][lang];
  if (h === 168) return TR["series.annWeek"][lang];
  if (h === 336) return TR["series.ann2w"][lang];
  return TR["series.annHours"][lang].replace("{n}", String(h));
}

function SubscriptionsSection() {
  const nav = useNavigate();
  const { t, lang } = useI18n(TR);
  const [items, setItems] = useState<EventSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirm = useConfirm();

  const reload = async () => {
    try {
      const list = await api.listEventSeries();
      setItems(list);
    } catch (e: any) {
      setError(e?.message ?? t("series.loadError"));
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
      setError(e?.message ?? t("series.updateError"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: EventSeries) => {
    const ok = await confirm({
      title: t("series.deleteTitle"),
      description: (
        <>
          {t("series.deleteDesc1")} <b>{s.title}</b> {t("series.deleteDesc2")}
        </>
      ),
      confirmLabel: t("common.delete"),
      confirmVariant: "destructive",
    });
    if (!ok) return;
    setBusyId(s.id);
    try {
      await api.deleteEventSeries(s.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== s.id));
    } catch (e: any) {
      setError(e?.message ?? t("series.deleteError"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{t("series.title")}</CardTitle>
            <CardDescription>
              {t("series.desc")}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => nav("/create?recurring=1")} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{t("series.create")}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div>
        )}

        {items === null ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("series.empty")}
            <div className="mt-3">
              <Button variant="outline" className="bg-transparent" onClick={() => nav("/create?recurring=1")}>
                <Plus className="h-4 w-4 mr-1" /> {t("series.createFirst")}
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
                        {formatDays(s.daysOfWeek, lang)} · {formatTime(s.startTime)}–{formatTime(s.endTime)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span>{t("series.courts", { n: s.courtsCount })}</span>
                        <span>·</span>
                        <span>{t("series.announce", { when: hoursLabel(s.materializeHoursBefore, lang), time: formatTime(s.materializeAtTime) })}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          {s.visibility === "PUBLIC" ? (<><Bell className="h-3 w-3" /> {t("series.public")}</>) : (<><ShieldCheck className="h-3 w-3" /> {t("series.private")}</>)}
                        </span>
                        {!s.active && (
                          <>
                            <span>·</span>
                            <span className="text-amber-700 dark:text-amber-300">{t("series.paused")}</span>
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
                      {t("common.edit")}
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
                          {t("series.pause")}
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 mr-1" />
                          {t("series.resume")}
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
                      {t("common.delete")}
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
