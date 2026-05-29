import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, MeResponse, setToken, TelegramAuthPayload } from "@/lib/api";

/**
 * Callback от Telegram OAuth (redirect-flow). Telegram возвращает сюда с URL hash:
 *   #tgAuthResult={base64-encoded JSON of {id, first_name, last_name, username, photo_url, auth_date, hash}}
 *
 * Парсим payload и шлём на /api/auth/telegram где бэк проверяет HMAC и выдаёт JWT.
 */
export function V0TelegramCallbackPage(props: { onAuth: (me: MeResponse) => void }) {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const result = params.get("tgAuthResult");

    if (!result) {
      setError("Telegram не вернул данные авторизации. Возможно вход отменён.");
      return;
    }

    let payload: TelegramAuthPayload;
    try {
      // base64url → base64 → JSON
      const b64 = result.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(result.length / 4) * 4, "=");
      payload = JSON.parse(atob(b64));
    } catch (e) {
      setError("Не удалось разобрать ответ Telegram");
      return;
    }

    // Это flow привязки к текущему юзеру (из Настроек) или обычный логин?
    const isLink = new URLSearchParams(window.location.search).get("link") === "true";

    // Чистим hash чтобы payload не светился в адресной строке
    window.history.replaceState(null, "", "/auth/telegram-callback");

    let cancelled = false;
    if (isLink) {
      // Привязка — юзер уже авторизован, дёргаем /api/me/auth/telegram/link
      api
        .linkTelegram(payload)
        .then((me) => {
          if (cancelled) return;
          props.onAuth(me);
          nav("/settings?tab=security", { replace: true });
        })
        .catch((e: any) => {
          if (!cancelled) setError(e?.message ?? "Не удалось привязать Telegram");
        });
    } else {
      // Логин или регистрация
      api
        .loginViaTelegram(payload)
        .then(async ({ token }) => {
          if (cancelled) return;
          setToken(token?.trim() || null);
          const me = await api.me();
          if (cancelled) return;
          props.onAuth(me);
          nav(me.surveyCompleted ? "/" : "/survey", { replace: true });
        })
        .catch((e: any) => {
          if (!cancelled) setError(e?.message ?? "Не удалось войти через Telegram");
        });
    }
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
              <div className="text-base font-medium">Завершаем вход через Telegram…</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
