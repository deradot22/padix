import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, FeedbackCategory, FeedbackTicket, MeResponse } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bug, Sparkles, HelpCircle, MessageSquare, Paperclip, X, Check, ChevronLeft, Send } from "lucide-react";

// 5 MB сырого бинарника — после base64 inflation ~6.7 MB data URL, в пределах серверного лимита (7 MB).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MIN_MESSAGE_LEN = 5;
const MAX_MESSAGE_LEN = 5000;

const CATEGORIES: { value: FeedbackCategory; label: string; icon: typeof Bug; hint: string }[] = [
  { value: "BUG", label: "Баг", icon: Bug, hint: "Что-то сломалось / работает не как ожидалось" },
  { value: "FEATURE", label: "Идея", icon: Sparkles, hint: "Хочется такую-то фичу" },
  { value: "QUESTION", label: "Вопрос", icon: HelpCircle, hint: "Как сделать X?" },
  { value: "OTHER", label: "Другое", icon: MessageSquare, hint: "Всё остальное" },
];

const labelByCategory: Record<FeedbackCategory, string> = {
  BUG: "Баг",
  FEATURE: "Идея",
  QUESTION: "Вопрос",
  OTHER: "Другое",
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function V0FeedbackPage(props: { me: MeResponse | null; meLoaded: boolean }) {
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
      .catch((e: any) => { if (!cancelled) setTicketsError(e?.message ?? "Не удалось загрузить тикеты"); });
    return () => { cancelled = true; };
  }, [props.me, props.meLoaded]);

  if (props.meLoaded && !props.me) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Обратная связь</h1>
        <p className="text-sm text-muted-foreground">
          Войдите, чтобы отправить тикет — так мы сможем ответить вам напрямую.
        </p>
        <Link to="/login" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Войти
        </Link>
      </div>
    );
  }

  function onPickFile(file: File) {
    setError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`Файл слишком большой: ${fmtBytes(file.size)}. Максимум ${fmtBytes(MAX_ATTACHMENT_BYTES)}.`);
      return;
    }
    const mime = file.type || "application/octet-stream";
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
      setError("Поддерживаются только изображения и видео.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setAttachment({ dataUrl, mime, sizeBytes: file.size, previewName: file.name });
    };
    reader.onerror = () => setError("Не удалось прочитать файл.");
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
      setInfo("Спасибо! Тикет отправлен.");
      window.setTimeout(() => setInfo(null), 3000);
    } catch (err: any) {
      setError(err?.message ?? "Не удалось отправить");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          На главную
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Обратная связь</h1>
        <p className="text-sm text-muted-foreground">
          Расскажите о баге или предложите идею. Можно приложить скриншот или короткое видео.
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Новый тикет</CardTitle>
          <CardDescription>
            Опишите проблему подробно. Чем больше деталей — тем быстрее починим.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Категория — desktop карточки, mobile select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Категория</label>
              <div className="hidden sm:grid sm:grid-cols-4 gap-2">
                {CATEGORIES.map(({ value, label, icon: Icon, hint }) => {
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
                      title={hint}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{hint}</div>
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
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Сообщение */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Сообщение</label>
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
                placeholder="Что произошло? Что вы делали перед этим? Что ожидали увидеть?"
                rows={6}
                maxLength={MAX_MESSAGE_LEN + 200}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y min-h-[120px]"
              />
            </div>

            {/* Вложение */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Вложение (опционально)</label>
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
                      aria-label="Убрать вложение"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
                  <Paperclip className="h-4 w-4" />
                  Прикрепить фото или видео
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
                Изображения или видео до {fmtBytes(MAX_ATTACHMENT_BYTES)}.
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
                {submitting ? "Отправляем…" : "Отправить"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Мои обращения</CardTitle>
          <CardDescription>История отправленных тикетов. Ответ прилетит во внешний канал (Telegram / email).</CardDescription>
        </CardHeader>
        <CardContent>
          {ticketsError ? (
            <div className="text-sm text-destructive">{ticketsError}</div>
          ) : tickets === null ? (
            <div className="text-sm text-muted-foreground">Загрузка…</div>
          ) : tickets.length === 0 ? (
            <div className="text-sm text-muted-foreground">Пока пусто. Отправьте первый тикет — мы прочитаем.</div>
          ) : (
            <ul className="space-y-3">
              {tickets.map((t) => (
                <li key={t.id} className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary/70 px-2 py-0.5 font-medium text-foreground">
                      {labelByCategory[t.category]}
                    </span>
                    <span>{fmtDate(t.createdAt)}</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap break-words text-sm">{t.message}</div>
                  {t.attachmentDataUrl && (
                    <div className="mt-2">
                      {t.attachmentMime?.startsWith("image/") ? (
                        <img src={t.attachmentDataUrl} alt="вложение" className="max-h-40 rounded border border-border" />
                      ) : t.attachmentMime?.startsWith("video/") ? (
                        <video src={t.attachmentDataUrl} controls className="max-h-48 rounded border border-border bg-black" />
                      ) : (
                        <a href={t.attachmentDataUrl} download className="text-xs underline">
                          Скачать вложение
                        </a>
                      )}
                      {typeof t.attachmentSizeBytes === "number" && (
                        <div className="mt-1 text-[11px] text-muted-foreground">{fmtBytes(t.attachmentSizeBytes)}</div>
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
