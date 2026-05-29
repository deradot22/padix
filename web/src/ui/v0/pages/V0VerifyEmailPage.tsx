import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

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
        setState({ kind: "error", message: e?.message ?? "Не удалось подтвердить email" });
      });
    return () => {
      cancelled = true;
    };
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
              <div className="text-base font-medium">Подтверждаем email…</div>
              <div className="text-sm text-muted-foreground">Это займёт пару секунд.</div>
            </div>
          )}

          {state.kind === "success" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div className="text-lg font-semibold">Email подтверждён</div>
              <div className="text-sm text-muted-foreground">
                Спасибо! Переадресую через несколько секунд…
              </div>
              <Button onClick={() => navigate(props.authed ? "/profile" : "/login", { replace: true })}>
                {props.authed ? "В профиль" : "Войти"}
              </Button>
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">Не удалось подтвердить</div>
              <div className="text-sm text-muted-foreground">{state.message}</div>
              <div className="text-xs text-muted-foreground">
                Ссылка могла истечь (живёт 24 часа) или уже была использована. Запроси новую в Настройках.
              </div>
              {props.authed ? (
                <Button asChild>
                  <Link to="/settings">Открыть настройки</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/login">Войти и запросить новую ссылку</Link>
                </Button>
              )}
            </div>
          )}

          {state.kind === "missing" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-muted-foreground" />
              <div className="text-lg font-semibold">Нет токена</div>
              <div className="text-sm text-muted-foreground">
                Открой эту страницу по ссылке из письма.
              </div>
              <Button asChild variant="outline">
                <Link to="/">На главную</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
