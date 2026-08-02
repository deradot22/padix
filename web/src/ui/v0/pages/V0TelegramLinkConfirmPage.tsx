import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, MeResponse, setToken } from "@/lib/api";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "tgLink.errNoToken": { ru: "Нет токена подтверждения в ссылке.", en: "The link has no confirmation token." },
  "tgLink.errInvalid": { ru: "Ссылка недействительна или истекла", en: "The link is invalid or has expired" },
  "tgLink.failedTitle": { ru: "Не удалось привязать", en: "Couldn't link" },
  "tgLink.toLogin": { ru: "На страницу входа", en: "Back to sign-in" },
  "tgLink.doneTitle": { ru: "Telegram привязан", en: "Telegram linked" },
  "tgLink.doneHint": { ru: "Заходим в Padix…", en: "Taking you into Padix…" },
  "tgLink.linking": { ru: "Привязываем Telegram…", en: "Linking Telegram…" },
} satisfies Dict;

/**
 * Страница приземления для confirm-link из email письма «Привязать Telegram к Padix?».
 * URL вида /auth/telegram-link-confirm?confirm=<сырой токен>.
 *
 * Поток:
 *  1. Page mount → читаем `confirm` из URL
 *  2. POST /api/auth/telegram/bot-login/confirm-link {confirm}
 *  3. Бэк привязывает telegram_user_id к существующему аккаунту, возвращает JWT
 *  4. Кладём JWT, дёргаем /me, редиректим на главную (или /survey если не пройдено)
 */
export function V0TelegramLinkConfirmPage(props: { onAuth: (me: MeResponse) => void }) {
  const nav = useNavigate();
  const { t } = useI18n(TR);
  const [params] = useSearchParams();
  const confirm = params.get("confirm") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!confirm) {
      setError(t("tgLink.errNoToken"));
      return;
    }
    let cancelled = false;
    api
      .telegramBotLoginConfirmLink(confirm)
      .then(async ({ token }) => {
        if (cancelled) return;
        setToken(token?.trim() || null);
        const me = await api.me();
        if (cancelled) return;
        props.onAuth(me);
        setDone(true);
        // Маленькая задержка — пусть юзер увидит «✅ Привязано», потом редирект.
        window.setTimeout(() => {
          if (!cancelled) nav(me.surveyCompleted ? "/" : "/survey", { replace: true });
        }, 1500);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? t("tgLink.errInvalid"));
      });
    return () => {
      cancelled = true;
    };
    // t намеренно вне зависимостей: смена языка не должна повторять запрос привязки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, nav, props]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          {error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">{t("tgLink.failedTitle")}</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={() => nav("/login", { replace: true })}>{t("tgLink.toLogin")}</Button>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div className="text-lg font-semibold">{t("tgLink.doneTitle")}</div>
              <div className="text-sm text-muted-foreground">{t("tgLink.doneHint")}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-base font-medium">{t("tgLink.linking")}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
