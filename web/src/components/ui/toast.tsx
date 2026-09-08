import { useCallback, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastVariant = "error" | "success" | "info";

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

/**
 * Лёгкий self-contained тост: хук держит очередь, `ToastViewport` рисует.
 * Не требует провайдера в корне приложения — монтируется локально на странице.
 * Тосты авто-исчезают, но их можно закрыть крестиком.
 */
export function useToasts(defaultDurationMs = 5000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", durationMs = defaultDurationMs) => {
      const id = ++seq.current;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (durationMs > 0) {
        timers.current[id] = setTimeout(() => dismissToast(id), durationMs);
      }
      return id;
    },
    [defaultDurationMs, dismissToast],
  );

  return { toasts, showToast, dismissToast };
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-primary/40 bg-primary/10 text-primary",
  info: "border-border bg-card text-foreground",
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "error") return <AlertCircle className="h-5 w-5 shrink-0" />;
  if (variant === "success") return <CheckCircle2 className="h-5 w-5 shrink-0" />;
  return <Info className="h-5 w-5 shrink-0" />;
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
      role="region"
      aria-live="assertive"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 ${VARIANT_STYLES[toast.variant]}`}
        >
          <VariantIcon variant={toast.variant} />
          <span className="flex-1 text-sm font-medium leading-snug">{toast.message}</span>
          <button
            type="button"
            aria-label="Закрыть"
            className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100 transition-opacity"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
