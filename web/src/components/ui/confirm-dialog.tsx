import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  warning?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive" | "secondary";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const close = (result: boolean) => {
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
