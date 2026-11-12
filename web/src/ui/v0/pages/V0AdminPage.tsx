import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, AdminUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  AdminShell,
  EmptyState,
  FilterChip,
  PasswordField,
  StatTile,
  Toggle,
  initialsOf,
  useAdminSession,
} from "@/components/admin/admin-shell";
import {
  Bell,
  ClipboardList,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

type StatusFilter = "ALL" | "ACTIVE" | "DISABLED" | "HIDDEN" | "DELETED" | "NO_SURVEY";
type SortKey = "name" | "rating" | "games" | "email";

function isDeleted(u: AdminUser) {
  return u.disabled && !!u.email?.startsWith("deleted-");
}

function matchesFilter(u: AdminUser, f: StatusFilter) {
  switch (f) {
    case "ACTIVE":
      return !u.disabled;
    case "DISABLED":
      return u.disabled && !isDeleted(u);
    case "HIDDEN":
      return u.hidden && !isDeleted(u);
    case "DELETED":
      return isDeleted(u);
    case "NO_SURVEY":
      return !u.surveyCompleted && !isDeleted(u);
    default:
      return true;
  }
}

function StatusBadges({ user, compact }: { user: AdminUser; compact?: boolean }) {
  const deleted = isDeleted(user);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {deleted ? (
        <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Удалён</Badge>
      ) : user.disabled ? (
        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">Отключён</Badge>
      ) : (
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Активен</Badge>
      )}
      {user.hidden && !deleted ? (
        <Badge variant="secondary" title="Скрыт из рейтинга и пикеров"><EyeOff />Скрыт</Badge>
      ) : null}
      {!user.surveyCompleted && !deleted ? (
        <Badge variant="outline" className="text-muted-foreground" title="Тест уровня не пройден">Без теста</Badge>
      ) : null}
      {user.isFeedbackAdmin && !deleted ? (
        <Badge variant="outline" className="text-muted-foreground" title="Получает Telegram-уведомления о тикетах">
          <Bell />{compact ? "TG" : "Тикеты в TG"}
        </Badge>
      ) : null}
    </div>
  );
}

function Avatar({ name, deleted, className }: { name: string; deleted?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
        deleted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        className,
      )}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  );
}

export function V0AdminPage() {
  const session = useAdminSession();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("name");

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [restoring, setRestoring] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    setLoading(true);
    api
      .adminListUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((e) => session.handleError(e, "Не удалось загрузить пользователей"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  const stats = useMemo(() => {
    const s = { total: users.length, active: 0, disabled: 0, hidden: 0, deleted: 0, noSurvey: 0 };
    for (const u of users) {
      if (isDeleted(u)) s.deleted += 1;
      else if (u.disabled) s.disabled += 1;
      else s.active += 1;
      if (u.hidden && !isDeleted(u)) s.hidden += 1;
      if (!u.surveyCompleted && !isDeleted(u)) s.noSurvey += 1;
    }
    return s;
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.filter((u) => {
      if (!matchesFilter(u, status)) return false;
      if (!q) return true;
      return [u.name, u.email ?? "", u.publicId].some((v) => v.toLowerCase().includes(q));
    });
    const cmp: Record<SortKey, (a: AdminUser, b: AdminUser) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, "ru"),
      email: (a, b) => (a.email ?? "").localeCompare(b.email ?? ""),
      rating: (a, b) => b.rating - a.rating,
      games: (a, b) => b.gamesPlayed - a.gamesPlayed,
    };
    return list.sort(cmp[sort]);
  }, [users, query, status, sort]);

  function replaceUser(updated: AdminUser) {
    setUsers((prev) => prev.map((u) => (u.userId === updated.userId ? updated : u)));
  }

  async function onDelete(user: AdminUser) {
    const ok = await confirm({
      title: `Удалить ${user.name}?`,
      description: (
        <>
          Аккаунт будет отключён, email заменён на служебный, имя — на «Удалённый пользователь», игрок пропадёт из рейтинга.
          История матчей сохранится. Позже аккаунт можно восстановить с новым email и паролем.
        </>
      ),
      confirmLabel: "Удалить",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      const updated = await api.adminDeleteUser(user.userId);
      replaceUser(updated);
      setEditing(null);
      session.toast(`${user.name} удалён`, "success");
    } catch (e) {
      session.handleError(e, "Не удалось удалить пользователя");
    }
  }

  const toolbar = (
    <Button onClick={() => setCreating(true)} className="gap-2">
      <Plus className="h-4 w-4" />
      <span className="hidden sm:inline">Добавить</span>
    </Button>
  );

  return (
    <AdminShell session={session} title="Пользователи" actions={toolbar}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Всего" value={stats.total} icon={Users} active={status === "ALL"} onClick={() => setStatus("ALL")} />
        <StatTile label="Активные" value={stats.active} icon={UserCheck} tone="primary" active={status === "ACTIVE"} onClick={() => setStatus("ACTIVE")} />
        <StatTile label="Отключённые" value={stats.disabled} icon={UserX} tone="warning" active={status === "DISABLED"} onClick={() => setStatus("DISABLED")} />
        <StatTile label="Скрытые" value={stats.hidden} icon={EyeOff} tone="muted" active={status === "HIDDEN"} onClick={() => setStatus("HIDDEN")} />
        <StatTile label="Без теста" value={stats.noSurvey} icon={ClipboardList} tone="muted" active={status === "NO_SURVEY"} onClick={() => setStatus("NO_SURVEY")} />
        <StatTile label="Удалённые" value={stats.deleted} icon={Trash2} tone="danger" active={status === "DELETED"} onClick={() => setStatus("DELETED")} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя, email или ID"
            className="h-10 pl-9"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Поиск пользователей"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-10 w-full sm:w-48" aria-label="Сортировка">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">По имени</SelectItem>
            <SelectItem value="rating">По рейтингу</SelectItem>
            <SelectItem value="games">По матчам</SelectItem>
            <SelectItem value="email">По email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ALL", "Все"],
            ["ACTIVE", "Активные"],
            ["DISABLED", "Отключённые"],
            ["HIDDEN", "Скрытые"],
            ["NO_SURVEY", "Без теста"],
            ["DELETED", "Удалённые"],
          ] as [StatusFilter, string][]
        ).map(([key, label]) => (
          <FilterChip key={key} active={status === key} onClick={() => setStatus(key)}>
            {label}
          </FilterChip>
        ))}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {loading ? "Загрузка…" : `${filtered.length} из ${users.length}`}
        </span>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={users.length === 0 ? "Пользователей пока нет" : "Никого не нашли"}
          text={users.length === 0 ? "Добавьте первого пользователя кнопкой «Добавить»." : "Попробуйте другой запрос или снимите фильтр."}
        />
      ) : (
        <>
          {/* Таблица — на планшетах и шире */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Игрок</th>
                  <th className="px-4 py-3 text-left font-semibold">Email</th>
                  <th className="px-4 py-3 text-right font-semibold">Рейтинг</th>
                  <th className="px-4 py-3 text-right font-semibold">NTRP</th>
                  <th className="px-4 py-3 text-right font-semibold">Матчей</th>
                  <th className="px-4 py-3 text-left font-semibold">Статус</th>
                  <th className="px-2 py-3 text-right font-semibold"><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => {
                  const deleted = isDeleted(u);
                  return (
                    <tr
                      key={u.userId}
                      className={cn("cursor-pointer transition-colors hover:bg-secondary/30", deleted && "opacity-60")}
                      onClick={() => setEditing(u)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} deleted={deleted} className="h-9 w-9" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{u.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{u.publicId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="max-w-[14rem] truncate" title={u.email ?? undefined}>
                          {u.email ?? <span className="italic">без email</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{u.rating}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{u.ntrp}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{u.gamesPlayed}</td>
                      <td className="px-4 py-3"><StatusBadges user={u} compact /></td>
                      <td className="w-px whitespace-nowrap px-2 py-3">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {deleted ? (
                            <Button variant="ghost" size="icon-sm" title="Восстановить" aria-label="Восстановить" onClick={() => setRestoring(u)}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon-sm" title="Удалить" aria-label="Удалить" className="hover:text-destructive" onClick={() => onDelete(u)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" title="Редактировать" aria-label="Редактировать" onClick={() => setEditing(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Карточки — на телефоне */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((u) => {
              const deleted = isDeleted(u);
              return (
                <button
                  type="button"
                  key={u.userId}
                  onClick={() => setEditing(u)}
                  className={cn(
                    "cursor-pointer rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40",
                    deleted && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={u.name} deleted={deleted} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{u.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{u.publicId}</span>
                        {u.email ? <> · {u.email}</> : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl font-bold leading-none tabular-nums">{u.rating}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">NTRP {u.ntrp} · {u.gamesPlayed} м.</div>
                    </div>
                  </div>
                  <div className="mt-3"><StatusBadges user={u} /></div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={(u) => {
          replaceUser(u);
          session.toast("Изменения сохранены", "success");
        }}
        onDelete={onDelete}
        onRestore={(u) => {
          setEditing(null);
          setRestoring(u);
        }}
        onError={session.handleError}
      />
      <RestoreUserDialog
        user={restoring}
        onClose={() => setRestoring(null)}
        onRestored={(u) => {
          replaceUser(u);
          session.toast(`${u.name} восстановлен`, "success");
        }}
        onError={session.handleError}
      />
      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(u) => {
          setUsers((prev) => [...prev, u]);
          session.toast(`${u.name} добавлен`, "success");
        }}
        onError={session.handleError}
      />
    </AdminShell>
  );
}

/* ---------- Диалог редактирования ---------- */

function EditUserDialog({
  user,
  onClose,
  onSaved,
  onDelete,
  onRestore,
  onError,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSaved: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
  onRestore: (u: AdminUser) => void;
  onError: (e: unknown, fallback: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [feedbackAdmin, setFeedbackAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email ?? "");
    setPassword("");
    setDisabled(user.disabled);
    setHidden(user.hidden);
    setFeedbackAdmin(user.isFeedbackAdmin);
  }, [user]);

  if (!user) return null;
  const deleted = isDeleted(user);

  const dirty =
    name.trim() !== user.name ||
    email.trim() !== (user.email ?? "") ||
    password.length > 0 ||
    disabled !== user.disabled ||
    hidden !== user.hidden ||
    feedbackAdmin !== user.isFeedbackAdmin;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const payload: Parameters<typeof api.adminUpdateUser>[1] = {};
    if (name.trim() && name.trim() !== user.name) payload.name = name.trim();
    if (email.trim() && email.trim() !== (user.email ?? "")) payload.email = email.trim();
    if (password) payload.password = password;
    if (disabled !== user.disabled) payload.disabled = disabled;
    if (hidden !== user.hidden) payload.hidden = hidden;
    if (feedbackAdmin !== user.isFeedbackAdmin) payload.isFeedbackAdmin = feedbackAdmin;
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const updated = await api.adminUpdateUser(user.userId, payload);
      onSaved(updated);
      onClose();
    } catch (err) {
      onError(err, "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar name={user.name} deleted={deleted} className="h-12 w-12 text-base" />
            <div className="min-w-0">
              <DialogTitle className="truncate">{user.name}</DialogTitle>
              <DialogDescription className="font-mono">
                {user.publicId} · рейтинг {user.rating} · {user.gamesPlayed} матчей
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {deleted ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <div className="font-medium text-destructive">Аккаунт удалён</div>
            <p className="mt-1 text-muted-foreground">
              Email и пароль сброшены. Чтобы вернуть игрока, восстановите аккаунт с новыми данными для входа.
            </p>
            <Button type="button" variant="outline" className="mt-3 gap-2" onClick={() => onRestore(user)}>
              <RotateCcw className="h-4 w-4" />
              Восстановить аккаунт
            </Button>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-5" autoComplete="off">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Профиль</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Имя в рейтинге</Label>
                <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} disabled={deleted} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="нет email" disabled={deleted} />
              </div>
            </div>
          </section>

          {!deleted ? (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Доступ</h3>
              <div className="space-y-1.5">
                <Label htmlFor="edit-password">Новый пароль</Label>
                <PasswordField id="edit-password" value={password} onChange={setPassword} placeholder="Оставьте пустым, чтобы не менять" />
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Флаги</h3>
            <Toggle
              checked={disabled}
              onChange={setDisabled}
              disabled={deleted}
              label="Аккаунт отключён"
              hint="Вход и любые действия запрещены"
            />
            <Toggle
              checked={hidden}
              onChange={setHidden}
              disabled={deleted}
              label="Скрыт из рейтинга и пикеров"
              hint="Для тестовых и служебных аккаунтов"
            />
            <Toggle
              checked={feedbackAdmin}
              onChange={setFeedbackAdmin}
              label="Получает тикеты в Telegram"
              hint="Нужен привязанный Telegram в настройках игрока"
            />
          </section>

          <DialogFooter className="sm:justify-between">
            {!deleted ? (
              <Button type="button" variant="ghost" className="gap-2 text-destructive hover:text-destructive sm:mr-auto" onClick={() => onDelete(user)} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                Удалить
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Отмена</Button>
              <Button type="submit" disabled={busy || !dirty}>{busy ? "Сохраняем…" : "Сохранить"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Диалог восстановления ---------- */

function RestoreUserDialog({
  user,
  onClose,
  onRestored,
  onError,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onRestored: (u: AdminUser) => void;
  onError: (e: unknown, fallback: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEmail("");
    setPassword("");
    setName("");
  }, [user]);

  if (!user) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      const updated = await api.adminRestoreUser(user.userId, {
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      onRestored(updated);
      onClose();
    } catch (err) {
      onError(err, "Не удалось восстановить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Восстановить аккаунт</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{user.publicId}</span> · история матчей и рейтинг сохранены. Задайте новые данные для входа.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
          <div className="space-y-1.5">
            <Label htmlFor="restore-email">Email</Label>
            <Input id="restore-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restore-password">Новый пароль</Label>
            <PasswordField id="restore-password" value={password} onChange={setPassword} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restore-name">Имя в рейтинге <span className="text-muted-foreground">(необязательно)</span></Label>
            <Input id="restore-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Оставить текущее" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Отмена</Button>
            <Button type="submit" disabled={busy || !email.trim() || !password} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {busy ? "Восстанавливаем…" : "Восстановить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Диалог создания ---------- */

function CreateUserDialog({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (u: AdminUser) => void;
  onError: (e: unknown, fallback: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [publicId, setPublicId] = useState("");
  const [rating, setRating] = useState("1000");
  const [ntrp, setNtrp] = useState("2.0");
  const [games, setGames] = useState("0");
  const [calibration, setCalibration] = useState("0");
  const [surveyCompleted, setSurveyCompleted] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPassword("");
    setName("");
    setPublicId("");
    setRating("1000");
    setNtrp("2.0");
    setGames("0");
    setCalibration("0");
    setSurveyCompleted(true);
    setDisabled(false);
    setLocalError(null);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !name.trim() || !password) {
      setLocalError("Email, имя и пароль обязательны");
      return;
    }
    const pid = publicId.trim() ? Number.parseInt(publicId.trim(), 10) : undefined;
    if (publicId.trim() && (Number.isNaN(pid) || pid! < 100_000_000 || pid! > 999_999_999)) {
      setLocalError("Public ID — число из 9 цифр (100000000–999999999)");
      return;
    }
    setBusy(true);
    try {
      const created = await api.adminCreateUser({
        email: email.trim(),
        password,
        name: name.trim(),
        publicId: pid ?? null,
        rating: Number.parseInt(rating, 10) || 1000,
        ntrp: ntrp.trim() || "2.0",
        gamesPlayed: Number.parseInt(games, 10) || 0,
        surveyCompleted,
        disabled,
        calibrationEventsRemaining: Number.parseInt(calibration, 10) || 0,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      onError(err, "Не удалось создать пользователя");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Новый пользователь</DialogTitle>
          <DialogDescription>Аккаунт создаётся сразу активным. Пароль передайте игроку лично.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5" autoComplete="off">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Вход</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-email">Email *</Label>
                <Input id="create-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="player@example.com" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-name">Имя в рейтинге *</Label>
                <Input id="create-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Петров" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-password">Пароль *</Label>
              <PasswordField id="create-password" value={password} onChange={setPassword} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Игровые данные</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-rating">Рейтинг</Label>
                <Input id="create-rating" type="number" inputMode="numeric" value={rating} onChange={(e) => setRating(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-ntrp">NTRP</Label>
                <Input id="create-ntrp" value={ntrp} onChange={(e) => setNtrp(e.target.value)} placeholder="2.0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-games">Матчей</Label>
                <Input id="create-games" type="number" inputMode="numeric" min={0} value={games} onChange={(e) => setGames(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-calibration">Калибровка</Label>
                <Input id="create-calibration" type="number" inputMode="numeric" min={0} value={calibration} onChange={(e) => setCalibration(e.target.value)} title="Сколько калибровочных игр осталось" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-publicId">Public ID <span className="text-muted-foreground">(необязательно, иначе авто)</span></Label>
              <Input id="create-publicId" type="number" inputMode="numeric" min={100_000_000} max={999_999_999} value={publicId} onChange={(e) => setPublicId(e.target.value)} placeholder="9 цифр" />
            </div>
          </section>

          <section className="space-y-2">
            <Toggle checked={surveyCompleted} onChange={setSurveyCompleted} label="Тест уровня пройден" hint="Иначе игроку покажут анкету при первом входе" />
            <Toggle checked={disabled} onChange={setDisabled} label="Создать отключённым" />
          </section>

          {localError ? <div role="alert" className="text-sm text-destructive">{localError}</div> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Отмена</Button>
            <Button type="submit" disabled={busy} className="gap-2">
              <Plus className="h-4 w-4" />
              {busy ? "Создаём…" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
