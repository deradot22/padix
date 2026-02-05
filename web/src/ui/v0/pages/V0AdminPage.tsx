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
  const [restoreUser, setRestoreUser] = useState<AdminUser | null>(null);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreName, setRestoreName] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPublicId, setCreatePublicId] = useState("");
  const [createRating, setCreateRating] = useState("1000");
  const [createNtrp, setCreateNtrp] = useState("2.0");
  const [createGamesPlayed, setCreateGamesPlayed] = useState("0");
  const [createSurveyCompleted, setCreateSurveyCompleted] = useState(false);
  const [createDisabled, setCreateDisabled] = useState(false);
  const [createCalibration, setCreateCalibration] = useState("0");

  useEffect(() => {
    if (!token) return;
    setFilter("");
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

  function isDeletedUser(user: AdminUser) {
    return user.disabled && user.email.startsWith("deleted-");
  }

  function openRestore(user: AdminUser) {
    setRestoreUser(user);
    setRestoreEmail("");
    setRestorePassword("");
    setRestoreName("");
    setError(null);
  }

  async function onRestore(e: FormEvent) {
    if (!restoreUser) return;
    e.preventDefault();
    if (!restoreEmail.trim() || !restorePassword) {
      setError("Укажите email и пароль");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const updated = await api.adminRestoreUser(restoreUser.userId, {
        email: restoreEmail.trim(),
        password: restorePassword,
        name: restoreName.trim() || undefined,
      });
      setUsers((prev) => prev.map((u) => (u.userId === updated.userId ? updated : u)));
      setRestoreUser(null);
    } catch (err: any) {
      setError(err?.message ?? "Ошибка восстановления");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    const email = createEmail.trim();
    const name = createName.trim();
    if (!email || !name || !createPassword) {
      setError("Укажите email, имя и пароль");
      return;
    }
    const publicIdNum = createPublicId.trim() ? parseInt(createPublicId.trim(), 10) : undefined;
    if (createPublicId.trim() && (Number.isNaN(publicIdNum) || publicIdNum! < 100000000 || publicIdNum! > 999999999)) {
      setError("Public ID: число от 100000000 до 999999999");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await api.adminCreateUser({
        email,
        password: createPassword,
        name,
        publicId: publicIdNum ?? null,
        rating: parseInt(createRating, 10) || 1000,
        ntrp: createNtrp.trim() || "2.0",
        gamesPlayed: parseInt(createGamesPlayed, 10) || 0,
        surveyCompleted: createSurveyCompleted,
        disabled: createDisabled,
        calibrationEventsRemaining: parseInt(createCalibration, 10) || 0,
      });
      setUsers((prev) => [...prev, created].sort((a, b) => a.email.localeCompare(b.email)));
      setShowCreate(false);
      setCreateEmail("");
      setCreatePassword("");
      setCreateName("");
      setCreatePublicId("");
      setCreateRating("1000");
      setCreateNtrp("2.0");
      setCreateGamesPlayed("0");
      setCreateSurveyCompleted(false);
      setCreateDisabled(false);
      setCreateCalibration("0");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка создания");
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
        <input
          type="text"
          name="fake-username"
          autoComplete="username"
          tabIndex={-1}
          className="absolute h-0 w-0 opacity-0 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="password"
          name="fake-password"
          autoComplete="current-password"
          tabIndex={-1}
          className="absolute h-0 w-0 opacity-0 pointer-events-none"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск по имени, email, public ID"
          className="max-w-md"
          autoComplete="new-password"
          name="admin-search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Поиск пользователей"
        />
        <Button variant="outline" onClick={() => { setShowCreate((v) => !v); setError(null); }}>
          {showCreate ? "Скрыть форму" : "Добавить пользователя"}
        </Button>
        {loading ? <div className="text-sm text-muted-foreground">Загрузка…</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
      </div>

      {showCreate ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Новый пользователь</h2>
          <form onSubmit={onCreateUser} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="create-email">Email *</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-password">Пароль *</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Обязательно"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-name">Имя *</Label>
                <Input
                  id="create-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Имя в рейтинге"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-publicId">Public ID (необяз., 100000000–999999999)</Label>
                <Input
                  id="create-publicId"
                  type="number"
                  min={100000000}
                  max={999999999}
                  value={createPublicId}
                  onChange={(e) => setCreatePublicId(e.target.value)}
                  placeholder="Авто"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-rating">Рейтинг</Label>
                <Input
                  id="create-rating"
                  type="number"
                  value={createRating}
                  onChange={(e) => setCreateRating(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-ntrp">NTRP</Label>
                <Input
                  id="create-ntrp"
                  value={createNtrp}
                  onChange={(e) => setCreateNtrp(e.target.value)}
                  placeholder="2.0"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-gamesPlayed">Матчей сыграно</Label>
                <Input
                  id="create-gamesPlayed"
                  type="number"
                  min={0}
                  value={createGamesPlayed}
                  onChange={(e) => setCreateGamesPlayed(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-calibration">Калибровочных событий осталось</Label>
                <Input
                  id="create-calibration"
                  type="number"
                  min={0}
                  value={createCalibration}
                  onChange={(e) => setCreateCalibration(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createSurveyCompleted}
                    onChange={(e) => setCreateSurveyCompleted(e.target.checked)}
                  />
                  <span className="text-sm">Тест пройден</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createDisabled}
                    onChange={(e) => setCreateDisabled(e.target.checked)}
                  />
                  <span className="text-sm">Отключен</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Создаём…" : "Создать"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={loading}>
                Отмена
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {restoreUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Восстановить пользователя</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {restoreUser.publicId} · {restoreUser.name}
            </p>
            <form onSubmit={onRestore} className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="restore-email">Email</Label>
                <Input
                  id="restore-email"
                  type="email"
                  value={restoreEmail}
                  onChange={(e) => setRestoreEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="restore-password">Новый пароль</Label>
                <Input
                  id="restore-password"
                  type="password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="Обязательно"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="restore-name">Имя (необязательно)</Label>
                <Input
                  id="restore-name"
                  value={restoreName}
                  onChange={(e) => setRestoreName(e.target.value)}
                  placeholder="Имя в рейтинге"
                />
              </div>
              {error ? <div className="text-sm text-destructive">{error}</div> : null}
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Восстанавливаем…" : "Восстановить"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setRestoreUser(null); setError(null); }} disabled={loading}>
                  Отмена
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
                {isDeletedUser(user) ? (
                  <Button variant="outline" onClick={() => openRestore(user)} disabled={loading}>
                    Восстановить
                  </Button>
                ) : null}
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
