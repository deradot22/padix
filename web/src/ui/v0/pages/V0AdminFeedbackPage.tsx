import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, adminToken, FeedbackTicket, setAdminToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ChevronLeft, Trash2 } from "lucide-react";

const labelByCategory: Record<string, string> = {
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
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function V0AdminFeedbackPage() {
  const nav = useNavigate();
  const confirm = useConfirm();
  const [token, setToken] = useState<string | null>(() => adminToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api.adminListFeedback()
      .then(setTickets)
      .catch((e: any) => setError(e?.message ?? "Не удалось загрузить тикеты"))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return tickets.filter((t) => {
      if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        t.authorName.toLowerCase().includes(q) ||
        t.message.toLowerCase().includes(q)
      );
    });
  }, [tickets, filter, categoryFilter]);

  async function onDelete(ticket: FeedbackTicket) {
    const ok = await confirm({
      title: "Удалить тикет?",
      description: <>Тикет от <b>{ticket.authorName}</b> ({labelByCategory[ticket.category] ?? ticket.category}) будет удалён. Действие нельзя отменить.</>,
      confirmLabel: "Удалить",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      await api.adminDeleteFeedback(ticket.id);
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    } catch (e: any) {
      setError(e?.message ?? "Не удалось удалить");
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Нужен admin-токен</h1>
        <p className="text-sm text-muted-foreground">Войдите в админку, чтобы посмотреть тикеты.</p>
        <Link to="/admin" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          К админке
        </Link>
      </div>
    );
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: tickets.length, BUG: 0, FEATURE: 0, QUESTION: 0, OTHER: 0 };
    tickets.forEach((t) => { c[t.category] = (c[t.category] ?? 0) + 1; });
    return c;
  }, [tickets]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
            К пользователям
          </Link>
          <h1 className="text-3xl font-bold mt-1">Обратная связь</h1>
          <p className="text-muted-foreground mt-1">Тикеты от пользователей. Отвечайте во внешнем канале.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setAdminToken(null);
            setToken(null);
            nav("/admin");
          }}
        >
          Выйти
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "BUG", "FEATURE", "QUESTION", "OTHER"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoryFilter(c)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${categoryFilter === c
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-secondary/40"}`}
          >
            {c === "ALL" ? "Все" : labelByCategory[c]}
            <span className="ml-1.5 opacity-70">{counts[c] ?? 0}</span>
          </button>
        ))}
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск по автору / тексту"
          className="max-w-sm"
        />
        {loading ? <span className="text-sm text-muted-foreground">Загрузка…</span> : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      {filtered.length === 0 && !loading ? (
        <div className="rounded-lg border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground">
          {tickets.length === 0 ? "Пока ни одного тикета." : "Ничего не найдено по фильтрам."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Card key={t.id} className="border-border/50">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-secondary/70 px-2 py-0.5 font-medium text-foreground">
                      {labelByCategory[t.category] ?? t.category}
                    </span>
                    <span className="font-medium text-foreground">{t.authorName}</span>
                    <span className="text-muted-foreground">· {fmtDate(t.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Удалить"
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm">{t.message}</div>
                {t.attachmentDataUrl && (
                  <div>
                    {t.attachmentMime?.startsWith("image/") ? (
                      <img src={t.attachmentDataUrl} alt="вложение" className="max-h-64 rounded border border-border" />
                    ) : t.attachmentMime?.startsWith("video/") ? (
                      <video src={t.attachmentDataUrl} controls className="max-h-72 rounded border border-border bg-black" />
                    ) : (
                      <a href={t.attachmentDataUrl} download className="text-xs underline">Скачать вложение</a>
                    )}
                    {typeof t.attachmentSizeBytes === "number" && (
                      <div className="mt-1 text-[11px] text-muted-foreground">{fmtBytes(t.attachmentSizeBytes)}</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
