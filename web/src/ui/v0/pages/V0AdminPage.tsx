import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, AdminUser, adminToken, setAdminToken } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type EditState = {
  name?: string;
  email?: string;
  password?: string;
  disabled?: boolean;
};

export function V0AdminPage() {
  const [token, setToken] = useState<string | null>(() => adminToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState("");
  const [edits, setEdits] = useState<Record<string, EditState>>({});

  const [loginUsername, setLoginUsername] = useState("admin228");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api
      .adminListUsers()
      .then(setUsers)
      .catch((e: any) => setError(e?.message ?? "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.email, u.publicId].some((v) => v.toLowerCase().includes(q)));
  }, [users, filter]);

  function editFor(userId: string): EditState {
    return edits[userId] ?? {};
  }

  function applyEdit(userId: string, next: EditState) {
    setEdits((prev) => ({ ...prev, [userId]: { ...prev[userId], ...next } }));
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminLogin(loginUsername, loginPassword);
      setAdminToken(res.token);
      setToken(res.token);
    } catch (err: any) {
      setError(err?.message ?? "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  async function onSave(user: AdminUser) {
    const draft = editFor(user.userId);
    const payload: EditState = {};
    if (draft.name && draft.name !== user.name) payload.name = draft.name;
    if (draft.email && draft.email !== user.email) payload.email = draft.email;
    if (draft.password) payload.password = draft.password;
    if (draft.disabled !== undefined && draft.disabled !== user.disabled) payload.disabled = draft.disabled;
    if (Object.keys(payload).length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.adminUpdateUser(user.userId, payload);
      setUsers((prev) => prev.map((u) => (u.userId === updated.userId ? updated : u)));
      setEdits((prev) => ({ ...prev, [user.userId]: { ...prev[user.userId], password: "" } }));
    } catch (err: any) {
      setError(err?.message ?? "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(user: AdminUser) {
    setLoading(true);
    setError(null);
    try {
      const updated = await api.adminDeleteUser(user.userId);
      setUsers((prev) => prev.map((u) => (u.userId === updated.userId ? updated : u)));
      setEdits((prev) => ({ ...prev, [user.userId]: {} }));
    } catch (err: any) {
      setError(err?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Админка</h1>
          <p className="text-muted-foreground mt-2">Вход по логину администратора.</p>
        </div>
        <form onSubmit={onLogin} className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="admin-username">Логин</Label>
            <Input id="admin-username" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Пароль</Label>
            <Input id="admin-password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
          </div>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          <Button className="w-full" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Админка пользователей</h1>
          <p className="text-muted-foreground mt-2">Редактируйте имена, почту и пароли.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setAdminToken(null);
            setToken(null);
            setUsers([]);
            setEdits({});
          }}
        >
          Выйти
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск по имени, email, public ID"
          className="max-w-md"
        />
        {loading ? <div className="text-sm text-muted-foreground">Загрузка…</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
      </div>

      <div className="grid gap-4">
        {filtered.map((user) => {
          const draft = editFor(user.userId);
          return (
            <div key={user.userId} className={cn("rounded-xl border border-border bg-card p-4", user.disabled && "opacity-70")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.publicId}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Рейтинг: <span className="text-foreground font-semibold">{user.rating}</span> · NTRP:{" "}
                  <span className="text-foreground font-semibold">{user.ntrp}</span> · Матчей:{" "}
                  <span className="text-foreground font-semibold">{user.gamesPlayed}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label>Имя</Label>
                  <Input
                    value={draft.name ?? user.name}
                    onChange={(e) => applyEdit(user.userId, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    value={draft.email ?? user.email}
                    onChange={(e) => applyEdit(user.userId, { email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Новый пароль</Label>
                  <Input
                    type="password"
                    value={draft.password ?? ""}
                    onChange={(e) => applyEdit(user.userId, { password: e.target.value })}
                    placeholder="Оставьте пустым"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Статус</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.disabled ?? user.disabled}
                      onChange={(e) => applyEdit(user.userId, { disabled: e.target.checked })}
                    />
                    <span className="text-sm">{(draft.disabled ?? user.disabled) ? "Отключен" : "Активен"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={() => onSave(user)} disabled={loading}>
                  Сохранить
                </Button>
                <Button variant="secondary" onClick={() => onDelete(user)} disabled={loading}>
                  Удалить
                </Button>
                {user.surveyCompleted ? (
                  <span className="text-xs text-muted-foreground">Тест пройден</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Тест не пройден</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
