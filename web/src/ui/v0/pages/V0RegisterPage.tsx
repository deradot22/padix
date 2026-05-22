import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, AuthConfig, setToken, TelegramAuthPayload } from "../../../lib/api";
import { TelegramLoginButton } from "@/components/telegram-login-button";

export function V0RegisterPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [tgLoading, setTgLoading] = useState(false);

  useEffect(() => {
    api.authConfig().then(setAuthConfig).catch(() => setAuthConfig(null));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.register(email, password, name, gender || undefined);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      nav("/survey");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function onTelegramAuth(payload: TelegramAuthPayload) {
    setTgLoading(true);
    setError(null);
    try {
      const { token } = await api.loginViaTelegram(payload);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      // Новый юзер из Telegram — анкета ещё не пройдена, кидаем туда.
      if (!me.surveyCompleted) nav("/survey");
      else nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Не удалось зарегистрироваться через Telegram");
    } finally {
      setTgLoading(false);
    }
  }

  const showTelegram = !!authConfig?.telegramBotUsername;

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
              <label className="text-sm font-medium">Пол</label>
              <select
                className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Не указан</option>
                <option value="M">М</option>
                <option value="F">Ж</option>
              </select>
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
              disabled={loading || tgLoading}
            >
              {loading ? "Создаём…" : "Создать аккаунт"}
            </button>
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
            ) : null}
          </form>

          {showTelegram && authConfig?.telegramBotUsername ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">или</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex justify-center">
                {tgLoading ? (
                  <div className="text-sm text-muted-foreground">Создаём аккаунт через Telegram…</div>
                ) : (
                  <TelegramLoginButton
                    botUsername={authConfig.telegramBotUsername}
                    onAuth={onTelegramAuth}
                    size="large"
                  />
                )}
              </div>
              <div className="text-xs text-muted-foreground text-center">
                Email можно будет добавить позже в настройках.
              </div>
            </div>
          ) : null}
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

