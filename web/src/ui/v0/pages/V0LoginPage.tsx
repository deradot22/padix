import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../../../lib/api";

export function V0LoginPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      const me = await api.me();
      props.onAuth(me);
      if (!me.surveyCompleted) nav("/survey");
      else nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Войти</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
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
                autoComplete="current-password"
              />
            </div>
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading}
            >
              {loading ? "Входим…" : "Войти"}
            </button>
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
            ) : null}
          </form>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="text-lg font-semibold">Нет аккаунта?</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Зарегистрируйся и пройди короткий опрос — это даст стартовый рейтинг.
          </div>
          <Link
            to="/register"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Регистрация →
          </Link>
        </div>
      </div>
    </div>
  );
}

