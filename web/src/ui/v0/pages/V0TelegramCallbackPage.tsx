import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, MeResponse, setToken, TelegramAuthPayload } from "@/lib/api";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "tgCb.errNoPayload": {
    ru: "Telegram не вернул данные авторизации. Возможно вход отменён.",
    en: "Telegram sent no auth data. The sign-in was probably cancelled.",
  },
  "tgCb.errParse": { ru: "Не удалось разобрать ответ Telegram", en: "Couldn't parse the Telegram response" },
  "tgCb.errLink": { ru: "Не удалось привязать Telegram", en: "Couldn't link Telegram" },
  "tgCb.errLogin": { ru: "Не удалось войти через Telegram", en: "Couldn't sign in with Telegram" },
  "tgCb.failedTitle": { ru: "Не удалось войти", en: "Couldn't sign in" },
  "tgCb.toLogin": { ru: "На страницу входа", en: "Back to sign-in" },
  "tgCb.finishing": { ru: "Завершаем вход через Telegram…", en: "Finishing Telegram sign-in…" },
} satisfies Dict;

/**
 * Callback от Telegram OAuth (redirect-flow). Telegram возвращает сюда с URL hash:
 *   #tgAuthResult={base64-encoded JSON of {id, first_name, last_name, username, photo_url, auth_date, hash}}
 *
 * Парсим payload и шлём на /api/auth/telegram где бэк проверяет HMAC и выдаёт JWT.
 */
export function V0TelegramCallbackPage(props: { onAuth: (me: MeResponse) => void }) {
  const nav = useNavigate();
  const { t } = useI18n(TR);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const result = params.get("tgAuthResult");

    if (!result) {
      setError(t("tgCb.errNoPayload"));
      return;
    }

    let payload: TelegramAuthPayload;
    try {
      // base64url → base64 → JSON
      const b64 = result.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(result.length / 4) * 4, "=");
      payload = JSON.parse(atob(b64));
    } catch (e) {
      setError(t("tgCb.errParse"));
      return;
    }

    // Это flow привязки к текущему юзеру (из Настроек) или обычный логин?
    const isLink = new URLSearchParams(window.location.search).get("link") === "true";

    // Чистим hash чтобы payload не светился в адресной строке
    window.history.replaceState(null, "", "/auth/telegram-callback");

    // Эта страница может открываться двумя способами:
    //  - В popup-окне (window.opener — родительская страница /login или /settings)
    //  - Full-page redirect (window.opener отсутствует или === window)
    // В popup'е после логина мы закрываемся — opener подхватит новый токен через storage-event.
    // В redirect-режиме делаем обычную навигацию.
    const inPopup = !!window.opener && window.opener !== window;

    let cancelled = false;
    if (isLink) {
      api
        .linkTelegram(payload)
        .then((me) => {
          if (cancelled) return;
          props.onAuth(me);
          if (inPopup) window.close();
          else nav("/settings?tab=security", { replace: true });
        })
        .catch((e: any) => {
          if (!cancelled) setError(e?.message ?? t("tgCb.errLink"));
        });
    } else {
      api
        .loginViaTelegram(payload)
        .then(async ({ token }) => {
          if (cancelled) return;
          setToken(token?.trim() || null);
          const me = await api.me();
          if (cancelled) return;
          props.onAuth(me);
          if (inPopup) window.close();
          else nav(me.surveyCompleted ? "/" : "/survey", { replace: true });
        })
        .catch((e: any) => {
          if (!cancelled) setError(e?.message ?? t("tgCb.errLogin"));
        });
    }
    return () => {
      cancelled = true;
    };
    // t намеренно вне зависимостей: смена языка не должна повторять авторизацию.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, props]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          {error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">{t("tgCb.failedTitle")}</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={() => nav("/login", { replace: true })}>{t("tgCb.toLogin")}</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-base font-medium">{t("tgCb.finishing")}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
