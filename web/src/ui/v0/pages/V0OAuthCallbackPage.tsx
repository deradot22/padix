import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, setToken } from "@/lib/api";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Парсим hash вручную (URLSearchParams не умеет с #).
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      setError(decodeOauthError(err));
      return;
    }
    if (!token) {
      setError("Не удалось получить токен авторизации");
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
        if (!cancelled) setError(e?.message ?? "Ошибка получения профиля");
      });
    return () => {
      cancelled = true;
    };
  }, [nav, props]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          {error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">Не удалось войти</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={() => nav("/login", { replace: true })}>На страницу входа</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-base font-medium">Завершаем вход…</div>
              <div className="text-sm text-muted-foreground">Пара секунд.</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Маппинг машинных error-кодов из бэка на человекочитаемые сообщения. */
function decodeOauthError(code: string): string {
  return when_(code, {
    twitter_cancelled: "Вход через X отменён. Попробуй ещё раз?",
    twitter_invalid_callback: "X вернул некорректные данные. Попробуй ещё раз.",
    twitter_state_unknown: "Сессия входа не найдена. Возможно, истекла — попробуй заново.",
    twitter_state_expired: "Сессия входа истекла. Попробуй заново.",
    twitter_state_provider_mismatch: "Внутренняя ошибка проверки сессии.",
    twitter_token_exchange_failed: "Не удалось получить токен от X. Попробуй позже.",
    twitter_profile_fetch_failed: "Не удалось загрузить профиль из X. Попробуй позже.",
  }) ?? `Ошибка авторизации: ${code}`;
}

function when_<T>(key: string, cases: Record<string, T>): T | null {
  return cases[key] ?? null;
}
