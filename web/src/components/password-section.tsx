import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KeyRound } from "lucide-react";
import { api, MeResponse } from "@/lib/api";

/**
 * Секция «Пароль» в настройках. Компактная карточка с одной кнопкой:
 *   - hasPassword=true  → «Сменить пароль» (открывает модал с currentPassword + new + confirm)
 *   - hasPassword=false → «Установить пароль» (модал без currentPassword)
 *
 * После установки пароля юзер сможет входить email+password в дополнение к OAuth.
 */
export function PasswordSection(props: {
  me: MeResponse;
  onMeUpdate: (me: MeResponse) => void;
}) {
  const hasPassword = props.me.hasPassword;
  const emailMissing = !props.me.email;
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Пароль
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? "Можете сменить пароль от аккаунта."
            : "Установите пароль, чтобы входить по email + паролю в дополнение к привязанным аккаунтам."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {emailMissing ? (
          <div className="mb-3 rounded-md border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
            У тебя не привязан email — пароль будет работать только после добавления email в разделе «Профиль».
          </div>
        ) : null}
        <Button onClick={() => setOpen(true)} variant={hasPassword ? "outline" : "default"}>
          {hasPassword ? "Сменить пароль" : "Установить пароль"}
        </Button>
      </CardContent>

      <PasswordDialog
        open={open}
        onOpenChange={setOpen}
        hasPassword={hasPassword}
        onMeUpdate={props.onMeUpdate}
      />
    </Card>
  );
}

function PasswordDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPassword: boolean;
  onMeUpdate: (me: MeResponse) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Сброс при каждом открытии — чтобы старые значения не висели.
  useEffect(() => {
    if (props.open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setSaving(false);
    }
  }, [props.open]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (props.hasPassword && !currentPassword) {
      setError("Введите текущий пароль");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.setPassword(newPassword, props.hasPassword ? currentPassword : null);
      props.onMeUpdate(updated);
      props.onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить пароль");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.hasPassword ? "Сменить пароль" : "Установить пароль"}</DialogTitle>
          <DialogDescription>
            {props.hasPassword
              ? "Введите текущий пароль для подтверждения, затем новый дважды."
              : "Придумайте пароль (минимум 6 символов) — затем сможете входить по email + паролю."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          {props.hasPassword ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Текущий пароль</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Новый пароль</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              autoFocus={!props.hasPassword}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Повторите новый пароль</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохраняем…" : props.hasPassword ? "Сменить пароль" : "Установить пароль"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
