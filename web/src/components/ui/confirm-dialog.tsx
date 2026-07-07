import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";

/** Одна из нескольких кнопок выбора (для confirm с 3+ вариантами). */
export type ConfirmChoice = {
  /** Значение, которое вернёт confirm() при выборе этой кнопки. */
  id: string;
  label: string;
  description?: string;
  variant?: "default" | "destructive" | "secondary" | "outline";
};

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  warning?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive" | "secondary";
  /**
   * Мультивыбор: если задан, вместо пары «Отмена/Подтвердить» рисуются эти кнопки
   * (вертикальным списком), и confirm() резолвит выбранный `id` (string). Закрытие
   * крестиком/Esc резолвит false.
   */
  choices?: ConfirmChoice[];
};

/** confirm() резолвит boolean для да/нет и string (choice.id) для мультивыбора. */
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean | string>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((value: boolean | string) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    return new Promise<boolean | string>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const close = (result: boolean | string) => {
    resolver?.(result);
    setResolver(null);
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(open) => { if (!open) close(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{opts?.title}</DialogTitle>
          </DialogHeader>
          {(opts?.description || opts?.warning) && (
            <div className="text-sm text-muted-foreground space-y-2">
              {opts?.description && <div>{opts.description}</div>}
              {opts?.warning && (
                <div className="text-amber-600 dark:text-amber-400">⚠️ {opts.warning}</div>
              )}
            </div>
          )}
          {opts?.choices && opts.choices.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {opts.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => close(c.id)}
                  className="flex flex-col items-start rounded-lg border border-border bg-secondary/30 px-4 py-3 text-left hover:bg-secondary/60 transition-colors"
                >
                  <span className="text-sm font-medium">{c.label}</span>
                  {c.description && (
                    <span className="text-xs text-muted-foreground">{c.description}</span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => close(false)}
                className="mt-1 self-end text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {opts.cancelLabel ?? "Отмена"}
              </button>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 justify-end">
              <Button variant="outline" className="bg-transparent" onClick={() => close(false)}>
                {opts?.cancelLabel ?? "Отмена"}
              </Button>
              <Button
                variant={opts?.confirmVariant ?? "default"}
                onClick={() => close(true)}
              >
                {opts?.confirmLabel ?? "Подтвердить"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
