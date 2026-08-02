import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, FeedbackCategory, FeedbackTicket, MeResponse } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bug, Sparkles, HelpCircle, MessageSquare, Paperclip, X, Check, ChevronLeft, Send } from "lucide-react";
import { Dict, getCurrentLang, useI18n } from "@/lib/i18n";

const TR = {
  "fb.title": { ru: "Обратная связь", en: "Feedback" },
  "fb.loginPrompt": {
    ru: "Войдите, чтобы отправить тикет — так мы сможем ответить вам напрямую.",
    en: "Sign in to send a ticket — that way we can reply to you directly.",
  },
  "fb.signIn": { ru: "Войти", en: "Sign in" },
  "fb.backHome": { ru: "На главную", en: "Home" },
  "fb.subtitle": {
    ru: "Расскажите о баге или предложите идею. Можно приложить скриншот или короткое видео.",
    en: "Report a bug or suggest an idea. You can attach a screenshot or a short video.",
  },
  "fb.newTicket": { ru: "Новый тикет", en: "New ticket" },
  "fb.newTicketHint": {
    ru: "Опишите проблему подробно. Чем больше деталей — тем быстрее починим.",
    en: "Describe the problem in detail. The more details, the faster we fix it.",
  },
  "fb.category": { ru: "Категория", en: "Category" },
  "fb.catBug": { ru: "Баг", en: "Bug" },
  "fb.catBugHint": { ru: "Что-то сломалось / работает не как ожидалось", en: "Something broke / doesn't work as expected" },
  "fb.catFeature": { ru: "Идея", en: "Idea" },
  "fb.catFeatureHint": { ru: "Хочется такую-то фичу", en: "I'd like this feature" },
  "fb.catQuestion": { ru: "Вопрос", en: "Question" },
  "fb.catQuestionHint": { ru: "Как сделать X?", en: "How do I do X?" },
  "fb.catOther": { ru: "Другое", en: "Other" },
  "fb.catOtherHint": { ru: "Всё остальное", en: "Everything else" },
  "fb.message": { ru: "Сообщение", en: "Message" },
  "fb.messagePlaceholder": {
    ru: "Что произошло? Что вы делали перед этим? Что ожидали увидеть?",
    en: "What happened? What were you doing before that? What did you expect to see?",
  },
  "fb.attachment": { ru: "Вложение (опционально)", en: "Attachment (optional)" },
  "fb.attachRemove": { ru: "Убрать вложение", en: "Remove attachment" },
  "fb.attachPick": { ru: "Прикрепить фото или видео", en: "Attach a photo or video" },
  "fb.attachLimit": { ru: "Изображения или видео до {max}.", en: "Images or videos up to {max}." },
  "fb.attachmentAlt": { ru: "вложение", en: "attachment" },
  "fb.attachDownload": { ru: "Скачать вложение", en: "Download attachment" },
  "fb.sending": { ru: "Отправляем…", en: "Sending…" },
  "fb.send": { ru: "Отправить", en: "Send" },
  "fb.sent": { ru: "Спасибо! Тикет отправлен.", en: "Thanks! Ticket sent." },
  "fb.myTickets": { ru: "Мои обращения", en: "My tickets" },
  "fb.myTicketsHint": {
    ru: "История отправленных тикетов. Ответ прилетит во внешний канал (Telegram / email).",
    en: "History of sent tickets. Replies arrive via an external channel (Telegram / email).",
  },
  "fb.loading": { ru: "Загрузка…", en: "Loading…" },
  "fb.empty": { ru: "Пока пусто. Отправьте первый тикет — мы прочитаем.", en: "Nothing yet. Send your first ticket — we'll read it." },
  "fb.errTooLarge": { ru: "Файл слишком большой: {size}. Максимум {max}.", en: "File is too large: {size}. Max {max}." },
  "fb.errType": { ru: "Поддерживаются только изображения и видео.", en: "Only images and videos are supported." },
  "fb.errRead": { ru: "Не удалось прочитать файл.", en: "Couldn't read the file." },
  "fb.errSubmit": { ru: "Не удалось отправить", en: "Couldn't send" },
  "fb.errTickets": { ru: "Не удалось загрузить тикеты", en: "Couldn't load tickets" },
} satisfies Dict;

// 5 MB сырого бинарника — после base64 inflation ~6.7 MB data URL, в пределах серверного лимита (7 MB).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MIN_MESSAGE_LEN = 5;
const MAX_MESSAGE_LEN = 5000;

const CATEGORIES: { value: FeedbackCategory; labelKey: keyof typeof TR; icon: typeof Bug; hintKey: keyof typeof TR }[] = [
  { value: "BUG", labelKey: "fb.catBug", icon: Bug, hintKey: "fb.catBugHint" },
  { value: "FEATURE", labelKey: "fb.catFeature", icon: Sparkles, hintKey: "fb.catFeatureHint" },
  { value: "QUESTION", labelKey: "fb.catQuestion", icon: HelpCircle, hintKey: "fb.catQuestionHint" },
  { value: "OTHER", labelKey: "fb.catOther", icon: MessageSquare, hintKey: "fb.catOtherHint" },
];

const labelKeyByCategory: Record<FeedbackCategory, keyof typeof TR> = {
  BUG: "fb.catBug",
  FEATURE: "fb.catFeature",
  QUESTION: "fb.catQuestion",
  OTHER: "fb.catOther",
};

function fmtBytes(n: number): string {
  const en = getCurrentLang() === "en";
  if (n < 1024) return `${n} ${en ? "B" : "Б"}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ${en ? "KB" : "КБ"}`;
  return `${(n / 1024 / 1024).toFixed(1)} ${en ? "MB" : "МБ"}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const locale = getCurrentLang() === "en" ? "en-US" : "ru-RU";
  return d.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function V0FeedbackPage(props: { me: MeResponse | null; meLoaded: boolean }) {
  const { t } = useI18n(TR);
  const [category, setCategory] = useState<FeedbackCategory>("BUG");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<{ dataUrl: string; mime: string; sizeBytes: number; previewName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tickets, setTickets] = useState<FeedbackTicket[] | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const messageLen = message.trim().length;
  const canSubmit = useMemo(
    () => !submitting && messageLen >= MIN_MESSAGE_LEN && messageLen <= MAX_MESSAGE_LEN,
    [submitting, messageLen],
  );

  useEffect(() => {
    if (!props.meLoaded || !props.me) return;
    let cancelled = false;
    api.getMyFeedback()
      .then((list) => { if (!cancelled) setTickets(list); })
      .catch((e: any) => { if (!cancelled) setTicketsError(e?.message ?? t("fb.errTickets")); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.me, props.meLoaded]);

  if (props.meLoaded && !props.me) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">{t("fb.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("fb.loginPrompt")}
        </p>
        <Link to="/login" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          {t("fb.signIn")}
        </Link>
      </div>
    );
  }

  function onPickFile(file: File) {
    setError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(t("fb.errTooLarge", { size: fmtBytes(file.size), max: fmtBytes(MAX_ATTACHMENT_BYTES) }));
      return;
    }
    const mime = file.type || "application/octet-stream";
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
      setError(t("fb.errType"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setAttachment({ dataUrl, mime, sizeBytes: file.size, previewName: file.name });
    };
    reader.onerror = () => setError(t("fb.errRead"));
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const created = await api.submitFeedback({
        category,
        message: message.trim(),
        attachmentDataUrl: attachment?.dataUrl ?? null,
      });
      setTickets((prev) => (prev ? [created, ...prev] : [created]));
      setMessage("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setInfo(t("fb.sent"));
      window.setTimeout(() => setInfo(null), 3000);
    } catch (err: any) {
      setError(err?.message ?? t("fb.errSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          {t("fb.backHome")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("fb.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("fb.subtitle")}
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>{t("fb.newTicket")}</CardTitle>
          <CardDescription>
            {t("fb.newTicketHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Категория — desktop карточки, mobile select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("fb.category")}</label>
              <div className="hidden sm:grid sm:grid-cols-4 gap-2">
                {CATEGORIES.map(({ value, labelKey, icon: Icon, hintKey }) => {
                  const active = value === category;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background hover:bg-secondary/40",
                      )}
                      title={t(hintKey)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{t(labelKey)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{t(hintKey)}</div>
                    </button>
                  );
                })}
              </div>
              <div className="sm:hidden">
                <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{t(c.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Сообщение */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t("fb.message")}</label>
                <span className={cn(
                  "text-xs",
                  messageLen > MAX_MESSAGE_LEN || (messageLen > 0 && messageLen < MIN_MESSAGE_LEN)
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}>
                  {messageLen} / {MAX_MESSAGE_LEN}
                </span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("fb.messagePlaceholder")}
                rows={6}
                maxLength={MAX_MESSAGE_LEN + 200}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y min-h-[120px]"
              />
            </div>

            {/* Вложение */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("fb.attachment")}</label>
              {attachment ? (
                <div className="rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="flex items-center gap-3">
                    {attachment.mime.startsWith("image/") ? (
                      <img src={attachment.dataUrl} alt="preview" className="h-16 w-16 rounded object-cover" />
                    ) : (
                      <video src={attachment.dataUrl} className="h-16 w-24 rounded object-cover bg-black" muted />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{attachment.previewName}</div>
                      <div className="text-xs text-muted-foreground">
                        {attachment.mime} · {fmtBytes(attachment.sizeBytes)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={t("fb.attachRemove")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
                  <Paperclip className="h-4 w-4" />
                  {t("fb.attachPick")}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onPickFile(file);
                    }}
                  />
                </label>
              )}
              <div className="text-[11px] text-muted-foreground">
                {t("fb.attachLimit", { max: fmtBytes(MAX_ATTACHMENT_BYTES) })}
              </div>
            </div>

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
              <Button type="submit" disabled={!canSubmit} className="gap-2">
                <Send className="h-4 w-4" />
                {submitting ? t("fb.sending") : t("fb.send")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>{t("fb.myTickets")}</CardTitle>
          <CardDescription>{t("fb.myTicketsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {ticketsError ? (
            <div className="text-sm text-destructive">{ticketsError}</div>
          ) : tickets === null ? (
            <div className="text-sm text-muted-foreground">{t("fb.loading")}</div>
          ) : tickets.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("fb.empty")}</div>
          ) : (
            <ul className="space-y-3">
              {tickets.map((tk) => (
                <li key={tk.id} className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary/70 px-2 py-0.5 font-medium text-foreground">
                      {t(labelKeyByCategory[tk.category])}
                    </span>
                    <span>{fmtDate(tk.createdAt)}</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap break-words text-sm">{tk.message}</div>
                  {tk.attachmentDataUrl && (
                    <div className="mt-2">
                      {tk.attachmentMime?.startsWith("image/") ? (
                        <img src={tk.attachmentDataUrl} alt={t("fb.attachmentAlt")} className="max-h-40 rounded border border-border" />
                      ) : tk.attachmentMime?.startsWith("video/") ? (
                        <video src={tk.attachmentDataUrl} controls className="max-h-48 rounded border border-border bg-black" />
                      ) : (
                        <a href={tk.attachmentDataUrl} download className="text-xs underline">
                          {t("fb.attachDownload")}
                        </a>
                      )}
                      {typeof tk.attachmentSizeBytes === "number" && (
                        <div className="mt-1 text-[11px] text-muted-foreground">{fmtBytes(tk.attachmentSizeBytes)}</div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
