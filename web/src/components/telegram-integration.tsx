import { useCallback, useEffect, useRef, useState } from "react";
import { api, TelegramChat, TelegramLinkToken, TelegramSettings, TelegramStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { Send, X, ChevronDown, Copy, Check, ExternalLink, MessageCircle, Users as UsersIcon, Bell, Moon, Pin } from "lucide-react";

type LinkTab = "private" | "group";

const REMINDER_OPTIONS = [
  { value: 1, label: "за 1 час" },
  { value: 2, label: "за 2 часа" },
  { value: 3, label: "за 3 часа" },
  { value: 4, label: "за 4 часа" },
  { value: 6, label: "за 6 часов" },
  { value: 12, label: "за 12 часов" },
  { value: 24, label: "за сутки" },
] as const;

function chatTypeLabel(type: TelegramChat["chatType"]): string {
  switch (type) {
    case "PRIVATE": return "Личка";
    case "GROUP":
    case "SUPERGROUP": return "Группа";
    case "CHANNEL": return "Канал";
    default: return type;
  }
}

function ChatIcon({ type }: { type: TelegramChat["chatType"] }) {
  if (type === "PRIVATE") return <MessageCircle className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
  if (type === "CHANNEL") return <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
  return <UsersIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Возвращает "HH:mm" или null для time инпута.
function toTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  // Бэк отдаёт "HH:mm:ss" или "HH:mm" — берём первые 5 символов.
  return value.slice(0, 5);
}

export function TelegramIntegrationCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const reloadChats = useCallback(async () => {
    try {
      const list = await api.getTelegramChats();
      setChats(list);
    } catch {
      // тихо
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getTelegramStatus();
        setStatus(s);
        if (!s.enabled) return;
        const [chatList, currentSettings] = await Promise.all([
          api.getTelegramChats(),
          api.getTelegramSettings(),
        ]);
        setChats(chatList);

        // Авто-синхронизация TZ из браузера, если в БД остался дефолт или TZ изменился.
        const tz = browserTimezone();
        if (tz && tz !== currentSettings.timezone) {
          try {
            const updated = await api.updateTelegramSettings({ timezone: tz });
            setSettings(updated);
          } catch {
            setSettings(currentSettings);
          }
        } else {
          setSettings(currentSettings);
        }
      } catch (e: any) {
        setError(e?.message ?? "Не удалось загрузить");
      }
    })();
  }, []);

  if (!status) return null;
  if (!status.enabled) return null;

  const patchSettings = async (payload: Parameters<typeof api.updateTelegramSettings>[0]) => {
    setSaving(true);
    try {
      const updated = await api.updateTelegramSettings(payload);
      setSettings(updated);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  const patchChatPrefs = async (
    chatId: string,
    payload: { notifyUpdated?: boolean; notifyFinished?: boolean; notifyReminder?: boolean }
  ) => {
    try {
      const updated = await api.updateTelegramChatPreferences(chatId, payload);
      setChats((prev) => prev.map((c) => (c.id === chatId ? updated : c)));
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить настройки чата");
    }
  };

  const handleUnlink = async (chat: TelegramChat) => {
    const ok = await confirm({
      title: "Отвязать чат?",
      description: (
        <>
          Чат <b>{chat.title}</b> больше не будет получать уведомления. Это не удаляет бота из чата.
        </>
      ),
      confirmLabel: "Отвязать",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      await api.unlinkTelegramChat(chat.id);
      await reloadChats();
    } catch (e: any) {
      setError(e?.message ?? "Не удалось отвязать чат");
    }
  };

  const quietEnabled = !!(settings?.quietHoursStart && settings?.quietHoursEnd);
  const reminderActive = (settings?.reminderHours ?? 0) > 0;

  return (
    <Card className="border-border/50">
      <CardHeader
        className="pb-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            Telegram
            {chats.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">({chats.length})</span>
            )}
            {settings && !settings.enabled && (
              <span className="text-xs font-normal text-muted-foreground border border-border rounded px-2 py-0.5">
                выключено
              </span>
            )}
          </CardTitle>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
        </div>
        <CardDescription>
          Приглашения, изменения и результаты игр прилетают в выбранные чаты.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn("space-y-5", !expanded && "hidden")}>
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div>
        )}

        {/* Master toggle */}
        {settings && (
          <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-sky-500"
              checked={settings.enabled}
              disabled={saving}
              onChange={(e) => patchSettings({ enabled: e.target.checked })}
            />
            <div className="flex-1">
              <div className="text-sm font-medium">Получать уведомления в Telegram</div>
              <div className="text-xs text-muted-foreground">
                Выключите, чтобы временно приостановить все сообщения без отвязывания чатов.
              </div>
            </div>
          </label>
        )}

        {/* Общие настройки (видны только если включено) */}
        {settings?.enabled && (
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Когда уведомлять
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Для обычных одноразовых игр. У серий настройки задаются отдельно при создании
              серии.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2 sm:flex-1">
                <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-sm">Напоминание о игре</div>
              </div>
              <Select
                value={reminderActive ? String(settings.reminderHours) : "0"}
                onValueChange={(v) => patchSettings({ reminderHours: Number(v) })}
              >
                <SelectTrigger className="w-full sm:w-[160px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">не отправлять</SelectItem>
                  {REMINDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <Moon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-sm flex-1 leading-snug">Тихие часы — не слать напоминания ночью</div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-500 mt-0.5"
                  checked={quietEnabled}
                  disabled={saving}
                  onChange={(e) => {
                    if (e.target.checked) {
                      patchSettings({ quietHoursStart: "22:00", quietHoursEnd: "09:00" });
                    } else {
                      patchSettings({ quietHoursDisabled: true });
                    }
                  }}
                />
              </label>
              {quietEnabled && (
                <div className="pl-7 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">с</span>
                    <input
                      type="time"
                      value={toTimeInput(settings.quietHoursStart)}
                      onChange={(e) => patchSettings({ quietHoursStart: e.target.value })}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                    />
                    <span className="text-muted-foreground">до</span>
                    <input
                      type="time"
                      value={toTimeInput(settings.quietHoursEnd)}
                      onChange={(e) => patchSettings({ quietHoursEnd: e.target.value })}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">Часовой пояс: {settings.timezone}</div>
                </div>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <Pin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm flex-1 leading-snug">
                Закреплять анонс новой игры в групповых чатах
                <div className="text-xs text-muted-foreground mt-0.5">
                  При следующем анонсе предыдущий открепляется автоматически.
                </div>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-500 mt-0.5"
                checked={settings.pinAnnouncement === true}
                disabled={saving}
                onChange={(e) => patchSettings({ pinAnnouncement: e.target.checked })}
              />
            </label>
          </div>
        )}

        {/* Личный чат — отдельный блок с акцентом на персональные напоминания */}
        {(() => {
          const privateChat = chats.find((c) => c.chatType === "PRIVATE");
          const groupChats = chats.filter((c) => c.chatType !== "PRIVATE");
          const dimmed = settings && !settings.enabled;
          return (
            <>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Личный чат
                </div>
                {privateChat ? (
                  <div
                    className={cn(
                      "rounded-lg bg-secondary/50 p-3 space-y-2 border border-sky-500/20",
                      dimmed && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <ChatIcon type={privateChat.chatType} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{privateChat.title}</div>
                        <div className="text-xs text-muted-foreground">
                          Сюда приходят персональные напоминания о ваших играх
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleUnlink(privateChat)}
                        aria-label="Отвязать"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <ChatToggle
                      label="получать напоминания за N часов до игры"
                      checked={privateChat.notifyReminder}
                      onChange={(v) => patchChatPrefs(privateChat.id, { notifyReminder: v })}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
                    Личный чат не привязан — вы не будете получать персональные напоминания
                    о играх, в которых зарегистрированы.
                  </div>
                )}
              </div>

              {/* Группы и каналы — для анонсов */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Группы и каналы
                </div>
                {groupChats.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Пока ни одной группы не привязано. Добавьте бота в групповой чат, чтобы
                    отправлять туда анонсы новых игр, изменения и итоги.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={cn("rounded-lg bg-secondary/50 p-3 space-y-2", dimmed && "opacity-60")}
                      >
                        <div className="flex items-center gap-3">
                          <ChatIcon type={chat.chatType} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{chat.title}</div>
                            <div className="text-xs text-muted-foreground">{chatTypeLabel(chat.chatType)}</div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleUnlink(chat)}
                            aria-label="Отвязать"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <ChatToggle
                            label="изменения и набор"
                            checked={chat.notifyUpdated}
                            onChange={(v) => patchChatPrefs(chat.id, { notifyUpdated: v })}
                          />
                          <ChatToggle
                            label="финал и результаты"
                            checked={chat.notifyFinished}
                            onChange={(v) => patchChatPrefs(chat.id, { notifyFinished: v })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Button onClick={() => setModalOpen(true)} variant="outline" className="w-full sm:w-auto">
                  <Send className="h-4 w-4 mr-2" />
                  Привязать чат
                </Button>
              </div>
            </>
          );
        })()}
      </CardContent>

      {modalOpen && (
        <TelegramLinkModal
          botUsername={status.botUsername}
          onClose={() => setModalOpen(false)}
          onLinked={reloadChats}
        />
      )}
    </Card>
  );
}

function ChatToggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer rounded-md bg-background/60 hover:bg-background px-2 py-1 transition-colors">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-sky-500"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="text-xs">{props.label}</span>
    </label>
  );
}

function TelegramLinkModal(props: {
  botUsername: string;
  onClose: () => void;
  onLinked: () => Promise<void>;
}) {
  const [tab, setTab] = useState<LinkTab>("private");
  const [tokenInfo, setTokenInfo] = useState<TelegramLinkToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"command" | "token" | null>(null);
  const [linkedChat, setLinkedChat] = useState<TelegramChat | null>(null);
  const baselineChatIds = useRef<Set<string>>(new Set());

  const refreshToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLinkedChat(null);
    try {
      const list = await api.getTelegramChats();
      baselineChatIds.current = new Set(list.map((c) => c.id));
      const t = await api.createTelegramLinkToken();
      setTokenInfo(t);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сгенерировать токен");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshToken();
  }, [refreshToken]);

  useEffect(() => {
    if (linkedChat) return;
    const id = window.setInterval(async () => {
      try {
        const list = await api.getTelegramChats();
        const fresh = list.find((c) => !baselineChatIds.current.has(c.id));
        if (fresh) {
          setLinkedChat(fresh);
          await props.onLinked();
        }
      } catch {
        // тихо
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [linkedChat, props]);

  const copy = async (text: string, what: "command" | "token") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            Привязка Telegram
          </DialogTitle>
          <DialogDescription>Выберите, куда вы хотите получать анонсы.</DialogDescription>
        </DialogHeader>

        {linkedChat ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/10 p-4 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="h-4 w-4" />
                Чат привязан
              </div>
              <div className="text-foreground">
                <b>{linkedChat.title}</b> — {chatTypeLabel(linkedChat.chatType).toLowerCase()}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={props.onClose}>Готово</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1 rounded-lg bg-secondary p-1">
              <button
                type="button"
                onClick={() => setTab("private")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
                  tab === "private" ? "bg-background shadow text-foreground" : "text-muted-foreground"
                )}
              >
                <MessageCircle className="h-4 w-4 inline mr-1" />
                Личка
              </button>
              <button
                type="button"
                onClick={() => setTab("group")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
                  tab === "group" ? "bg-background shadow text-foreground" : "text-muted-foreground"
                )}
              >
                <UsersIcon className="h-4 w-4 inline mr-1" />
                Группа / канал
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div>
            )}

            {loading || !tokenInfo ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Генерируем токен…</div>
            ) : tab === "private" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Откройте бота <b>@{props.botUsername}</b>, нажмите Start — этот чат привяжется к вашему профилю.
                </p>
                <a
                  href={tokenInfo.deeplink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-sky-500 hover:bg-sky-400 text-white py-2.5 text-sm font-medium transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Открыть @{props.botUsername}
                </a>
                <div className="text-xs text-muted-foreground text-center">
                  Окно автоматически обновится, когда привязка пройдёт.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <ol className="text-sm text-foreground space-y-2 list-decimal pl-5">
                  <li>Добавьте бота <b>@{props.botUsername}</b> в нужный чат или сделайте админом канала.</li>
                  <li>
                    Отправьте в этот чат команду:
                    <div className="mt-1 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 font-mono text-xs">
                      <span className="flex-1 break-all">{tokenInfo.linkCommand}</span>
                      <button
                        type="button"
                        onClick={() => copy(tokenInfo.linkCommand, "command")}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Скопировать"
                      >
                        {copied === "command" ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </li>
                  <li>Бот ответит подтверждением — окно автоматически обновится.</li>
                </ol>
                <div className="text-xs text-muted-foreground">
                  Токен действует 15 минут. После привязки токен сгорает.
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={refreshToken}
                disabled={loading}
                className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                Сгенерировать новый токен
              </button>
              <Button variant="outline" className="bg-transparent" onClick={props.onClose}>
                Закрыть
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
