import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../../../lib/api";

export function V0RegisterPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.register(email, password, name);
      setToken(token);
      const me = await api.me();
      props.onAuth(me);
      nav("/survey");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Регистрация</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Имя (как в рейтинге)</label>
              <input
                className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <input
                className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Пароль</label>
              <input
                className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading}
            >
              {loading ? "Создаём…" : "Создать аккаунт"}
            </button>
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
            ) : null}
          </form>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="text-lg font-semibold">Уже есть аккаунт?</div>
          <div className="mt-2 text-sm text-muted-foreground">Войди, чтобы увидеть игры и свой профиль.</div>
          <Link
            to="/login"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Войти →
          </Link>
        </div>
      </div>
    </div>
  );
}

