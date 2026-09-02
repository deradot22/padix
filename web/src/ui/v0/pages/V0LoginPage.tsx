import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, AuthConfig, setAdminToken, setToken, TelegramAuthPayload } from "../../../lib/api";
import { TelegramLoginButton } from "@/components/telegram-login-button";
import { GoogleLoginButton } from "@/components/google-login-button";
import { FacebookLoginButton } from "@/components/facebook-login-button";
import { TwitterLoginButton } from "@/components/twitter-login-button";
import { Dict, useI18n } from "@/lib/i18n";
import { nextPath } from "@/lib/next-path";

const TR = {
  "login.title": { ru: "Войти", en: "Sign in" },
  "login.emailLabel": { ru: "Email или логин администратора", en: "Email or admin login" },
  "login.password": { ru: "Пароль", en: "Password" },
  "login.submitting": { ru: "Входим…", en: "Signing in…" },
  "login.submit": { ru: "Войти", en: "Sign in" },
  "login.or": { ru: "или", en: "or" },
  "login.noAccount": { ru: "Нет аккаунта?", en: "No account yet?" },
  "login.noAccountHint": {
    ru: "Зарегистрируйся и пройди короткий опрос — это даст стартовый рейтинг.",
    en: "Sign up and take a short survey — it sets your starting rating.",
  },
  "login.register": { ru: "Регистрация →", en: "Sign up →" },
  "login.errGeneric": { ru: "Ошибка", en: "Error" },
  "login.errTelegram": { ru: "Не удалось войти через Telegram", en: "Couldn't sign in with Telegram" },
  "login.errGoogle": { ru: "Не удалось войти через Google", en: "Couldn't sign in with Google" },
  "login.errFacebook": { ru: "Не удалось войти через Facebook", en: "Couldn't sign in with Facebook" },
} satisfies Dict;

export function V0LoginPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const location = useLocation();
  // ?next= — страница, с которой пользователя развернули на вход (см. AuthRequiredCard).
  const backTo = nextPath(location.search);
  const { t } = useI18n(TR);
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
      else nav(backTo);
    } catch (err: any) {
      setError(err?.message ?? t("login.errGeneric"));
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
      else nav(backTo);
    } catch (err: any) {
      setError(err?.message ?? t("login.errTelegram"));
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
      else nav(backTo);
    } catch (err: any) {
      setError(err?.message ?? t("login.errGoogle"));
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
      else nav(backTo);
    } catch (err: any) {
      setError(err?.message ?? t("login.errFacebook"));
    } finally {
      setFbLoading(false);
    }
  }

  // Telegram теперь redirect-flow — нужен botId, а не только username.
  const showTelegram = !!authConfig?.telegramBotId;
  const showGoogle = !!authConfig?.googleClientId;
  const showFacebook = !!authConfig?.facebookAppId;
  const showTwitter = !!authConfig?.twitterClientId;
  const showAnyOAuth = showTelegram || showGoogle || showFacebook || showTwitter;
  const anyLoading = loading || googleLoading || fbLoading; // tgLoading больше не нужен — redirect

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("login.title")}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("login.emailLabel")}</label>
              <input
                className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("login.password")}</label>
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
              {loading ? t("login.submitting") : t("login.submit")}
            </button>
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
            ) : null}
          </form>

          {showAnyOAuth ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("login.or")}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-row items-center justify-center gap-3 flex-wrap">
                {showGoogle && authConfig?.googleClientId ? (
                  googleLoading ? (
                    <div className="h-10 w-10 flex items-center justify-center text-xs text-muted-foreground">…</div>
                  ) : (
                    <GoogleLoginButton
                      clientId={authConfig.googleClientId}
                      onAuth={onGoogleAuth}
                      text="signin_with"
                      size="large"
                    />
                  )
                ) : null}
                {showTelegram && authConfig?.telegramBotId ? (
                  <TelegramLoginButton
                    botId={authConfig.telegramBotId}
                    botUsername={authConfig.telegramBotUsername ?? undefined}
                  />
                ) : null}
                {showFacebook && authConfig?.facebookAppId ? (
                  fbLoading ? (
                    <div className="h-10 w-10 flex items-center justify-center text-xs text-muted-foreground">…</div>
                  ) : (
                    <FacebookLoginButton
                      appId={authConfig.facebookAppId}
                      onAuth={onFacebookAuth}
                    />
                  )
                ) : null}
                {showTwitter ? <TwitterLoginButton /> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="text-lg font-semibold">{t("login.noAccount")}</div>
          <div className="mt-2 text-sm text-muted-foreground">
            {t("login.noAccountHint")}
          </div>
          <Link
            to={`/register${location.search}`}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium hover:bg-secondary transition-colors"
          >
            {t("login.register")}
          </Link>
        </div>
      </div>
    </div>
  );
}
