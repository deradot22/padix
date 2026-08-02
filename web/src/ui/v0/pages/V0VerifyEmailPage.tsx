import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "verify.loading": { ru: "Подтверждаем email…", en: "Verifying email…" },
  "verify.loadingHint": { ru: "Это займёт пару секунд.", en: "It takes a couple of seconds." },
  "verify.success": { ru: "Email подтверждён", en: "Email verified" },
  "verify.successHint": { ru: "Спасибо! Переадресую через несколько секунд…", en: "Thanks! Redirecting in a few seconds…" },
  "verify.toProfile": { ru: "В профиль", en: "To profile" },
  "verify.signIn": { ru: "Войти", en: "Sign in" },
  "verify.failed": { ru: "Не удалось подтвердить", en: "Verification failed" },
  "verify.failedHint": {
    ru: "Ссылка могла истечь (живёт 24 часа) или уже была использована. Запроси новую в Настройках.",
    en: "The link may have expired (valid for 24 hours) or was already used. Request a new one in Settings.",
  },
  "verify.openSettings": { ru: "Открыть настройки", en: "Open settings" },
  "verify.signInRequest": { ru: "Войти и запросить новую ссылку", en: "Sign in and request a new link" },
  "verify.noToken": { ru: "Нет токена", en: "No token" },
  "verify.noTokenHint": { ru: "Открой эту страницу по ссылке из письма.", en: "Open this page via the link from the email." },
  "verify.home": { ru: "На главную", en: "Home" },
  "verify.errGeneric": { ru: "Не удалось подтвердить email", en: "Couldn't verify email" },
} satisfies Dict;

type State =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "missing" };

/**
 * Страница `/verify-email?token=...`. При маунте отправляет токен на бэк.
 * После успеха через 3 секунды редиректит на главную (или оставляет здесь — у юзера есть кнопка).
 */
export function V0VerifyEmailPage(props: {
  authed: boolean;
  onVerified?: () => void;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n(TR);
  const [state, setState] = useState<State>(() =>
    params.get("token") ? { kind: "loading" } : { kind: "missing" },
  );

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState({ kind: "missing" });
      return;
    }
    let cancelled = false;
    api
      .verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setState({ kind: "success" });
        props.onVerified?.();
      })
      .catch((e: any) => {
        if (cancelled) return;
        setState({ kind: "error", message: e?.message ?? t("verify.errGeneric") });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, props]);

  // После успеха автоматический редирект — не сразу, чтобы юзер успел увидеть подтверждение.
  useEffect(() => {
    if (state.kind !== "success") return;
    const timer = window.setTimeout(() => navigate(props.authed ? "/profile" : "/login", { replace: true }), 3000);
    return () => window.clearTimeout(timer);
  }, [state, navigate, props.authed]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          {state.kind === "loading" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-base font-medium">{t("verify.loading")}</div>
              <div className="text-sm text-muted-foreground">{t("verify.loadingHint")}</div>
            </div>
          )}

          {state.kind === "success" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div className="text-lg font-semibold">{t("verify.success")}</div>
              <div className="text-sm text-muted-foreground">
                {t("verify.successHint")}
              </div>
              <Button onClick={() => navigate(props.authed ? "/profile" : "/login", { replace: true })}>
                {props.authed ? t("verify.toProfile") : t("verify.signIn")}
              </Button>
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">{t("verify.failed")}</div>
              <div className="text-sm text-muted-foreground">{state.message}</div>
              <div className="text-xs text-muted-foreground">
                {t("verify.failedHint")}
              </div>
              {props.authed ? (
                <Button asChild>
                  <Link to="/settings">{t("verify.openSettings")}</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/login">{t("verify.signInRequest")}</Link>
                </Button>
              )}
            </div>
          )}

          {state.kind === "missing" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-muted-foreground" />
              <div className="text-lg font-semibold">{t("verify.noToken")}</div>
              <div className="text-sm text-muted-foreground">
                {t("verify.noTokenHint")}
              </div>
              <Button asChild variant="outline">
                <Link to="/">{t("verify.home")}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
