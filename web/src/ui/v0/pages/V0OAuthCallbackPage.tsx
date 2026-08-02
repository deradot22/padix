import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, setToken } from "@/lib/api";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "oauth.errNoToken": { ru: "Не удалось получить токен авторизации", en: "Couldn't get the auth token" },
  "oauth.errProfile": { ru: "Ошибка получения профиля", en: "Couldn't load your profile" },
  "oauth.failedTitle": { ru: "Не удалось войти", en: "Couldn't sign in" },
  "oauth.toLogin": { ru: "На страницу входа", en: "Back to sign-in" },
  "oauth.finishing": { ru: "Завершаем вход…", en: "Finishing sign-in…" },
  "oauth.finishingHint": { ru: "Пара секунд.", en: "Just a couple of seconds." },
  "oauth.errCancelled": { ru: "Вход через X отменён. Попробуй ещё раз?", en: "X sign-in was cancelled. Try again?" },
  "oauth.errInvalidCallback": {
    ru: "X вернул некорректные данные. Попробуй ещё раз.",
    en: "X sent back bad data. Give it another try.",
  },
  "oauth.errStateUnknown": {
    ru: "Сессия входа не найдена. Возможно, истекла — попробуй заново.",
    en: "Sign-in session not found. It may have expired — start over.",
  },
  "oauth.errStateExpired": { ru: "Сессия входа истекла. Попробуй заново.", en: "Sign-in session expired. Start over." },
  "oauth.errProviderMismatch": { ru: "Внутренняя ошибка проверки сессии.", en: "Internal session check error." },
  "oauth.errTokenExchange": {
    ru: "Не удалось получить токен от X. Попробуй позже.",
    en: "Couldn't get a token from X. Try again later.",
  },
  "oauth.errProfileFetch": {
    ru: "Не удалось загрузить профиль из X. Попробуй позже.",
    en: "Couldn't load your X profile. Try again later.",
  },
  "oauth.errUnknown": { ru: "Ошибка авторизации: {code}", en: "Auth error: {code}" },
} satisfies Dict;

type TFn = (key: keyof typeof TR & string, vars?: Record<string, string | number>) => string;

/**
 * Страница `/auth/oauth-callback` — точка приземления после OAuth-провайдеров,
 * которые используют redirect flow (Twitter/X сейчас).
 *
 * Бэк редиректит сюда с JWT в URL hash: `#token=<JWT>` (или `#error=<code>` если что-то пошло не так).
 * Hash используется вместо ?query, чтобы токен НЕ попал в access_log серверов и Referer-заголовки.
 */
export function V0OAuthCallbackPage(props: {
  onAuth: (me: any) => void;
}) {
  const nav = useNavigate();
  const { t } = useI18n(TR);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Парсим hash вручную (URLSearchParams не умеет с #).
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      setError(decodeOauthError(t, err));
      return;
    }
    if (!token) {
      setError(t("oauth.errNoToken"));
      return;
    }

    setToken(token);
    // Чистим hash из URL чтобы token не светился в адресной строке
    window.history.replaceState(null, "", "/auth/oauth-callback");

    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        props.onAuth(me);
        nav(me.surveyCompleted ? "/" : "/survey", { replace: true });
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? t("oauth.errProfile"));
      });
    return () => {
      cancelled = true;
    };
    // t намеренно вне зависимостей: смена языка не должна повторять обмен токена.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, props]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          {error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">{t("oauth.failedTitle")}</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={() => nav("/login", { replace: true })}>{t("oauth.toLogin")}</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-base font-medium">{t("oauth.finishing")}</div>
              <div className="text-sm text-muted-foreground">{t("oauth.finishingHint")}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Маппинг машинных error-кодов из бэка на человекочитаемые сообщения. */
function decodeOauthError(t: TFn, code: string): string {
  return when_(code, {
    twitter_cancelled: t("oauth.errCancelled"),
    twitter_invalid_callback: t("oauth.errInvalidCallback"),
    twitter_state_unknown: t("oauth.errStateUnknown"),
    twitter_state_expired: t("oauth.errStateExpired"),
    twitter_state_provider_mismatch: t("oauth.errProviderMismatch"),
    twitter_token_exchange_failed: t("oauth.errTokenExchange"),
    twitter_profile_fetch_failed: t("oauth.errProfileFetch"),
  }) ?? t("oauth.errUnknown", { code });
}

function when_<T>(key: string, cases: Record<string, T>): T | null {
  return cases[key] ?? null;
}
