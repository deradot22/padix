import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Баннер «Подтвердите email» — показывается на всех страницах для залогиненных юзеров,
 * у которых ещё не подтверждён email. Кнопка «Отправить ещё раз» дёргает onResend.
 *
 * Можно скрыть на текущую сессию (sessionStorage), чтобы не мешать работе —
 * на следующем заходе баннер снова появится.
 */
export function EmailVerificationBanner(props: {
  email: string;
  onResend: () => Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("email_verify_banner_dismissed") === "1",
  );
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<null | { kind: "ok" | "err"; text: string }>(null);

  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem("email_verify_banner_dismissed", "1");
    setDismissed(true);
  };

  const handleResend = async () => {
    try {
      setSending(true);
      setStatus(null);
      await props.onResend();
      setStatus({ kind: "ok", text: "Письмо отправлено. Проверь почту." });
    } catch (e: any) {
      setStatus({ kind: "err", text: e?.message ?? "Не удалось отправить" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 text-amber-100">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex items-start gap-2 text-xs sm:text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-medium">Подтвердите email</span>
            <span className="hidden sm:inline">
              {" "}— письмо со ссылкой отправлено на <span className="font-mono">{props.email}</span>.
            </span>
            {status ? (
              <span className={status.kind === "ok" ? "ml-2 text-emerald-300" : "ml-2 text-rose-300"}>
                {status.text}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-100 hover:bg-amber-500/20 hover:text-amber-50"
            onClick={handleResend}
            disabled={sending}
          >
            {sending ? "Отправляю…" : "Отправить ещё раз"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50"
            onClick={handleDismiss}
            aria-label="Скрыть"
            title="Скрыть"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
