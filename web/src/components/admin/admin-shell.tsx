import { FormEvent, ReactNode, useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, ApiRequestError, adminToken, setAdminToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToastItem, ToastVariant, ToastViewport, useToasts } from "@/components/ui/toast";
import { AlertCircle, Eye, EyeOff, KeyRound, LogOut, MessageSquare, ShieldCheck, UserRound, Users } from "lucide-react";

/* ---------- Сессия администратора ---------- */

export type AdminSession = {
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Показывает тост; при 401/403 от admin-API завершает сессию. */
  handleError: (e: unknown, fallback: string) => void;
  toast: (message: string, variant?: ToastVariant) => void;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
};

export function useAdminSession(): AdminSession {
  const [token, setToken] = useState<string | null>(() => adminToken());
  const { toasts, showToast, dismissToast } = useToasts(4500);

  const logout = useCallback(() => {
    setAdminToken(null);
    setToken(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.adminLogin(username.trim(), password);
    setAdminToken(res.token);
    setToken(res.token);
  }, []);

  const handleError = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof ApiRequestError && (e.status === 401 || e.status === 403)) {
        showToast("Сессия администратора истекла — войдите снова", "error");
        logout();
        return;
      }
      const msg = e instanceof Error && e.message ? e.message : fallback;
      showToast(msg, "error");
    },
    [logout, showToast],
  );

  return { token, login, logout, handleError, toast: showToast, toasts, dismissToast };
}

/* ---------- Каркас страницы ---------- */

const NAV = [
  { to: "/admin", label: "Пользователи", icon: Users },
  { to: "/admin/feedback", label: "Обратная связь", icon: MessageSquare },
] as const;

export function AdminShell({
  session,
  title,
  description,
  actions,
  children,
}: {
  session: AdminSession;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();

  if (!session.token) {
    return (
      <>
        <AdminLogin session={session} />
        <ToastViewport toasts={session.toasts} onDismiss={session.dismissToast} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Админка</div>
            <h1 className="font-display text-3xl font-bold leading-none">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="outline" onClick={session.logout} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Выйти</span>
          </Button>
        </div>
      </div>

      <nav className="inline-flex rounded-xl border border-border bg-card p-1" aria-label="Разделы админки">
        {NAV.map((item) => {
          const active = location.pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {description ? <p className="text-sm text-muted-foreground -mt-2">{description}</p> : null}

      {children}
      <ToastViewport toasts={session.toasts} onDismiss={session.dismissToast} />
    </div>
  );
}

/* ---------- Экран входа ---------- */

function AdminLogin({ session }: { session: AdminSession }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await session.login(username, password);
    } catch (err: unknown) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      setError(status === 401 ? "Неверный логин или пароль" : err instanceof Error && err.message ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-center font-display text-3xl font-bold">Вход в админку</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Отдельный доступ администратора Padix. Обычный аккаунт игрока здесь не подойдёт.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" autoComplete="off">
          <div className="space-y-1.5">
            <Label htmlFor="admin-username">Логин</Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-username"
                className="h-11 pl-9"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Пароль</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-password"
                className="h-11 pl-9 pr-11"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                aria-label={show ? "Скрыть пароль" : "Показать пароль"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </Button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">← На сайт</Link>
      </p>
    </div>
  );
}

/* ---------- Общие элементы ---------- */

export function StatTile({
  label,
  value,
  icon: Icon,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "primary" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
        active ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40 hover:bg-secondary/30",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
        <div className={cn("mt-1 font-display text-3xl font-bold leading-none tabular-nums", toneClass)}>{value}</div>
      </div>
      <Icon className={cn("h-5 w-5 shrink-0 opacity-70", toneClass)} />
    </button>
  );
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/30", disabled && "cursor-not-allowed opacity-60")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
  withGenerate = true,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  withGenerate?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pr-10 font-mono"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {withGenerate ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onChange(generatePassword());
            setShow(true);
          }}
          title="Сгенерировать надёжный пароль"
        >
          Сгенерировать
        </Button>
      ) : null}
    </div>
  );
}

/** 16 символов без похожих друг на друга знаков (0/O, 1/l/I). */
export function generatePassword(length = 16): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_!@#$%";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0][0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase();
}

export function EmptyState({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div className="font-medium">{title}</div>
      {text ? <div className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</div> : null}
    </div>
  );
}
