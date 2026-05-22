import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, AuthConfig, setAdminToken, setToken, TelegramAuthPayload } from "../../../lib/api";
import { TelegramLoginButton } from "@/components/telegram-login-button";
import { GoogleLoginButton } from "@/components/google-login-button";
import { FacebookLoginButton } from "@/components/facebook-login-button";

export function V0LoginPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);

  useEffect(() => {
    api.authConfig().then(setAuthConfig).catch(() => setAuthConfig(null));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!email.includes("@")) {
        const { token } = await api.adminLogin(email, password);
        setAdminToken(token);
        setToken(null);
        nav("/admin");
        return;
      }
      const { token } = await api.login(email, password);
      setAdminToken(null);
      setToken(token?.trim() || null);
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

  async function onTelegramAuth(payload: TelegramAuthPayload) {
    setTgLoading(true);
    setError(null);
    try {
      const { token } = await api.loginViaTelegram(payload);
      setAdminToken(null);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      if (!me.surveyCompleted) nav("/survey");
      else nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Не удалось войти через Telegram");
    } finally {
      setTgLoading(false);
    }
  }

  async function onGoogleAuth(idToken: string) {
    setGoogleLoading(true);
    setError(null);
    try {
      const { token } = await api.loginViaGoogle(idToken);
      setAdminToken(null);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      if (!me.surveyCompleted) nav("/survey");
      else nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Не удалось войти через Google");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function onFacebookAuth(accessToken: string) {
    setFbLoading(true);
    setError(null);
    try {
      const { token } = await api.loginViaFacebook(accessToken);
      setAdminToken(null);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      if (!me.surveyCompleted) nav("/survey");
      else nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Не удалось войти через Facebook");
    } finally {
      setFbLoading(false);
    }
  }

  const showTelegram = !!authConfig?.telegramBotUsername;
  const showGoogle = !!authConfig?.googleClientId;
  const showFacebook = !!authConfig?.facebookAppId;
  const showAnyOAuth = showTelegram || showGoogle || showFacebook;
  const anyLoading = loading || tgLoading || googleLoading || fbLoading;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Войти</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email или логин администратора</label>
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
              disabled={anyLoading}
            >
              {loading ? "Входим…" : "Войти"}
            </button>
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
            ) : null}
          </form>

          {showAnyOAuth ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">или</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col items-center gap-3">
                {showGoogle && authConfig?.googleClientId ? (
                  googleLoading ? (
                    <div className="text-sm text-muted-foreground">Входим через Google…</div>
                  ) : (
                    <GoogleLoginButton
                      clientId={authConfig.googleClientId}
                      onAuth={onGoogleAuth}
                      text="signin_with"
                      size="large"
                    />
                  )
                ) : null}
                {showFacebook && authConfig?.facebookAppId ? (
                  fbLoading ? (
                    <div className="text-sm text-muted-foreground">Входим через Facebook…</div>
                  ) : (
                    <FacebookLoginButton
                      appId={authConfig.facebookAppId}
                      onAuth={onFacebookAuth}
                    />
                  )
                ) : null}
                {showTelegram && authConfig?.telegramBotUsername ? (
                  tgLoading ? (
                    <div className="text-sm text-muted-foreground">Входим через Telegram…</div>
                  ) : (
                    <TelegramLoginButton
                      botUsername={authConfig.telegramBotUsername}
                      onAuth={onTelegramAuth}
                      size="large"
                    />
                  )
                ) : null}
              </div>
            </div>
          ) : null}
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
