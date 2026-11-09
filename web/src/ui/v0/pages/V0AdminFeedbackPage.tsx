import { useEffect, useMemo, useState } from "react";
import { api, FeedbackTicket } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AdminShell, EmptyState, FilterChip, StatTile, initialsOf, useAdminSession } from "@/components/admin/admin-shell";
import { Bug, Download, HelpCircle, Inbox, Lightbulb, MessageSquare, Paperclip, Search, Trash2 } from "lucide-react";

type Category = FeedbackTicket["category"];
type CategoryFilter = "ALL" | Category;

const CATEGORY: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; badge: string; accent: string }> = {
  BUG: {
    label: "Баг",
    icon: Bug,
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    accent: "bg-destructive",
  },
  FEATURE: {
    label: "Идея",
    icon: Lightbulb,
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    accent: "bg-amber-500",
  },
  QUESTION: {
    label: "Вопрос",
    icon: HelpCircle,
    badge: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    accent: "bg-sky-500",
  },
  OTHER: {
    label: "Другое",
    icon: MessageSquare,
    badge: "border-border bg-secondary text-foreground",
    accent: "bg-muted-foreground",
  },
};

function categoryOf(c: string) {
  return CATEGORY[c] ?? { ...CATEGORY.OTHER, label: c };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function V0AdminFeedbackPage() {
  const session = useAdminSession();
  const confirm = useConfirm();
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [preview, setPreview] = useState<FeedbackTicket | null>(null);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    setLoading(true);
    api
      .adminListFeedback()
      .then((list) => {
        if (!cancelled) setTickets(list);
      })
      .catch((e) => session.handleError(e, "Не удалось загрузить тикеты"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: tickets.length, BUG: 0, FEATURE: 0, QUESTION: 0, OTHER: 0 };
    for (const t of tickets) c[t.category] = (c[t.category] ?? 0) + 1;
    return c;
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (category !== "ALL" && t.category !== category) return false;
      if (!q) return true;
      return t.authorName.toLowerCase().includes(q) || t.message.toLowerCase().includes(q);
    });
  }, [tickets, query, category]);

  async function onDelete(ticket: FeedbackTicket) {
    const ok = await confirm({
      title: "Удалить тикет?",
      description: (
        <>
          Сообщение от <b>{ticket.authorName}</b> ({categoryOf(ticket.category).label}) будет удалено без возможности восстановления.
        </>
      ),
      confirmLabel: "Удалить",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      await api.adminDeleteFeedback(ticket.id);
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
      session.toast("Тикет удалён", "success");
    } catch (e) {
      session.handleError(e, "Не удалось удалить тикет");
    }
  }

  return (
    <AdminShell session={session} title="Обратная связь" description="Сообщения игроков из формы обратной связи. Отвечать им нужно во внешнем канале.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Все" value={counts.ALL} icon={Inbox} active={category === "ALL"} onClick={() => setCategory("ALL")} />
        <StatTile label="Баги" value={counts.BUG} icon={Bug} tone="danger" active={category === "BUG"} onClick={() => setCategory("BUG")} />
        <StatTile label="Идеи" value={counts.FEATURE} icon={Lightbulb} tone="warning" active={category === "FEATURE"} onClick={() => setCategory("FEATURE")} />
        <StatTile label="Вопросы" value={counts.QUESTION} icon={HelpCircle} active={category === "QUESTION"} onClick={() => setCategory("QUESTION")} />
        <StatTile label="Другое" value={counts.OTHER} icon={MessageSquare} tone="muted" active={category === "OTHER"} onClick={() => setCategory("OTHER")} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Автор или текст сообщения"
            className="h-10 pl-9"
            aria-label="Поиск по тикетам"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "BUG", "FEATURE", "QUESTION", "OTHER"] as CategoryFilter[]).map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c === "ALL" ? "Все" : categoryOf(c).label}
              <span className="opacity-70 tabular-nums">{counts[c] ?? 0}</span>
            </FilterChip>
          ))}
        </div>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tickets.length === 0 ? "Пока ни одного сообщения" : "Ничего не найдено"}
          text={tickets.length === 0 ? "Когда игроки напишут через форму обратной связи, тикеты появятся здесь." : "Попробуйте другой запрос или категорию."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const cat = categoryOf(t.category);
            const Icon = cat.icon;
            const isImage = t.attachmentMime?.startsWith("image/");
            const isVideo = t.attachmentMime?.startsWith("video/");
            return (
              <article key={t.id} className="relative overflow-hidden rounded-xl border border-border bg-card">
                <div className={cn("absolute inset-y-0 left-0 w-1", cat.accent)} aria-hidden="true" />
                <div className="flex gap-4 p-4 pl-5">
                  <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-sm font-bold text-foreground sm:flex" aria-hidden="true">
                    {initialsOf(t.authorName)}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <Badge variant="outline" className={cat.badge}><Icon />{cat.label}</Badge>
                      <span className="font-medium">{t.authorName}</span>
                      <time dateTime={t.createdAt} title={fmtDate(t.createdAt)} className="text-xs text-muted-foreground">
                        {fmtRelative(t.createdAt)}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{t.message}</p>
                    {t.attachmentDataUrl ? (
                      <div className="flex items-center gap-3 pt-1">
                        {isImage ? (
                          <button
                            type="button"
                            onClick={() => setPreview(t)}
                            className="cursor-pointer overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-90"
                            aria-label="Открыть вложение"
                          >
                            <img src={t.attachmentDataUrl} alt="" className="h-24 w-auto max-w-[12rem] object-cover" loading="lazy" />
                          </button>
                        ) : isVideo ? (
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setPreview(t)}>
                            <Paperclip className="h-4 w-4" />Видео
                          </Button>
                        ) : (
                          <a href={t.attachmentDataUrl} download className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-secondary/50">
                            <Download className="h-4 w-4" />Скачать вложение
                          </a>
                        )}
                        {typeof t.attachmentSizeBytes === "number" ? (
                          <span className="text-xs text-muted-foreground">{fmtBytes(t.attachmentSizeBytes)}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(t)}
                    aria-label="Удалить тикет"
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Вложение</DialogTitle>
            <DialogDescription>
              {preview ? <>{preview.authorName} · {fmtDate(preview.createdAt)}</> : null}
            </DialogDescription>
          </DialogHeader>
          {preview?.attachmentDataUrl ? (
            preview.attachmentMime?.startsWith("video/") ? (
              <video src={preview.attachmentDataUrl} controls className="max-h-[70vh] w-full rounded-lg bg-black" />
            ) : (
              <img src={preview.attachmentDataUrl} alt="Вложение к тикету" className="max-h-[70vh] w-full rounded-lg object-contain" />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
