import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, AuthConfig, setToken, TelegramAuthPayload } from "../../../lib/api";
import { TelegramLoginButton } from "@/components/telegram-login-button";
import { GoogleLoginButton } from "@/components/google-login-button";
import { FacebookLoginButton } from "@/components/facebook-login-button";
import { TwitterLoginButton } from "@/components/twitter-login-button";
import { Dict, useI18n } from "@/lib/i18n";
import { nextPath } from "@/lib/next-path";

const TR = {
  "reg.title": { ru: "Регистрация", en: "Sign up" },
  "reg.nameLabel": { ru: "Имя (как в рейтинге)", en: "Name (as shown in the rating)" },
  "reg.gender": { ru: "Пол", en: "Gender" },
  "reg.genderNone": { ru: "Не указан", en: "Not specified" },
  "reg.genderM": { ru: "М", en: "M" },
  "reg.genderF": { ru: "Ж", en: "F" },
  "reg.password": { ru: "Пароль", en: "Password" },
  "reg.submitting": { ru: "Создаём…", en: "Creating…" },
  "reg.submit": { ru: "Создать аккаунт", en: "Create account" },
  "reg.or": { ru: "или", en: "or" },
  "reg.emailLater": {
    ru: "Email можно будет добавить позже в настройках.",
    en: "You can add an email later in settings.",
  },
  "reg.haveAccount": { ru: "Уже есть аккаунт?", en: "Already have an account?" },
  "reg.haveAccountHint": { ru: "Войди, чтобы увидеть игры и свой профиль.", en: "Sign in to see games and your profile." },
  "reg.signIn": { ru: "Войти →", en: "Sign in →" },
  "reg.errGeneric": { ru: "Ошибка", en: "Error" },
  "reg.errTelegram": { ru: "Не удалось зарегистрироваться через Telegram", en: "Couldn't sign up with Telegram" },
  "reg.errGoogle": { ru: "Не удалось зарегистрироваться через Google", en: "Couldn't sign up with Google" },
  "reg.errFacebook": { ru: "Не удалось зарегистрироваться через Facebook", en: "Couldn't sign up with Facebook" },
} satisfies Dict;

export function V0RegisterPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const location = useLocation();
  // ?next= — страница, с которой пользователя развернули на вход (см. AuthRequiredCard).
  const backTo = nextPath(location.search);
  const { t } = useI18n(TR);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState<string>("");
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
      const { token } = await api.register(email, password, name, gender || undefined);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      nav("/survey");
    } catch (err: any) {
      setError(err?.message ?? t("reg.errGeneric"));
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
      else nav(backTo);
    } catch (err: any) {
      setError(err?.message ?? t("reg.errTelegram"));
    } finally {
      setTgLoading(false);
    }
  }

  async function onGoogleAuth(idToken: string) {
    setGoogleLoading(true);
    setError(null);
    try {
      const { token } = await api.loginViaGoogle(idToken);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      if (!me.surveyCompleted) nav("/survey");
      else nav(backTo);
    } catch (err: any) {
      setError(err?.message ?? t("reg.errGoogle"));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function onFacebookAuth(accessToken: string) {
    setFbLoading(true);
    setError(null);
    try {
      const { token } = await api.loginViaFacebook(accessToken);
      setToken(token?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      if (!me.surveyCompleted) nav("/survey");
      else nav(backTo);
    } catch (err: any) {
      setError(err?.message ?? t("reg.errFacebook"));
    } finally {
      setFbLoading(false);
    }
  }

  const showTelegram = !!authConfig?.telegramBotId;
  const showGoogle = !!authConfig?.googleClientId;
  const showFacebook = !!authConfig?.facebookAppId;
  const showTwitter = !!authConfig?.twitterClientId;
  const showAnyOAuth = showTelegram || showGoogle || showFacebook || showTwitter;
  const anyLoading = loading || tgLoading || googleLoading || fbLoading;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("reg.title")}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("reg.nameLabel")}</label>
              <input
                className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("reg.gender")}</label>
              <select
                className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">{t("reg.genderNone")}</option>
                <option value="M">{t("reg.genderM")}</option>
                <option value="F">{t("reg.genderF")}</option>
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
              <label className="text-sm font-medium">{t("reg.password")}</label>
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
              disabled={anyLoading}
            >
              {loading ? t("reg.submitting") : t("reg.submit")}
            </button>
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
            ) : null}
          </form>

          {showAnyOAuth ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("reg.or")}</span>
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
                      text="signup_with"
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
              {showTelegram ? (
                <div className="text-xs text-muted-foreground text-center">
                  {t("reg.emailLater")}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="text-lg font-semibold">{t("reg.haveAccount")}</div>
          <div className="mt-2 text-sm text-muted-foreground">{t("reg.haveAccountHint")}</div>
          <Link
            to={`/login${location.search}`}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium hover:bg-secondary transition-colors"
          >
            {t("reg.signIn")}
          </Link>
        </div>
      </div>
    </div>
  );
}
