import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, MeResponse } from "@/lib/api";

/**
 * Секция «Пароль» в настройках. Поведение зависит от наличия пароля у юзера:
 *
 *  - hasPassword=true → форма «Сменить пароль»: currentPassword + newPassword + confirmPassword
 *  - hasPassword=false (OAuth-only юзер) → форма «Установить пароль»: только newPassword + confirmPassword
 *
 * После установки пароля юзер сможет входить email+password в дополнение к OAuth.
 */
export function PasswordSection(props: {
  me: MeResponse;
  onMeUpdate: (me: MeResponse) => void;
}) {
  const hasPassword = props.me.hasPassword;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (hasPassword && !currentPassword) {
      setError("Введите текущий пароль");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.setPassword(newPassword, hasPassword ? currentPassword : null);
      props.onMeUpdate(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить пароль");
    } finally {
      setSaving(false);
    }
  };

  // Если у юзера есть email — он может входить по паролю. Если email = null (Telegram-only)
  // пароль бесполезен пока не добавлен email. Показываем подсказку.
  const emailMissing = !props.me.email;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{hasPassword ? "Сменить пароль" : "Установить пароль"}</CardTitle>
      </CardHeader>
      <CardContent>
        {emailMissing ? (
          <div className="mb-4 rounded-md border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
            У тебя не привязан email — пароль будет работать только после добавления email в разделе «Профиль».
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-3 max-w-md">
          {hasPassword ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Текущий пароль</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
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
          {success ? (
            <div className="rounded-md border border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
              Пароль обновлён.
            </div>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? "Сохраняем…" : hasPassword ? "Сменить пароль" : "Установить пароль"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
