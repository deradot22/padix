import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, MeResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";

const BOY_AVATARS = [
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy1",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy2",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy3",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy4",
  "https://api.dicebear.com/8.x/avataaars/png?seed=boy5",
];
const GIRL_AVATARS = [
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl1",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl2",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl3",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl4",
  "https://api.dicebear.com/8.x/avataaars/png?seed=girl5",
];

function compressAvatar(file: File, maxSize = 256, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Нет контекста canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Модальное окно редактирования профиля: аватар, имя, email, пол, тоггл «показывать
 * шансы выигрыша». Аватар и тоггл — auto-save (одноклик, сразу api.updateAvatar /
 * api.updateProfile). Имя/email/пол — копятся локально и сохраняются по кнопке
 * «Сохранить».
 *
 * Используется на /profile (карандашик в шапке карточки).
 */
export function EditProfileDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: MeResponse;
  onSaved: (me: MeResponse) => void;
}) {
  const [name, setName] = useState(props.me.name ?? "");
  const [email, setEmail] = useState(props.me.email ?? "");
  const [gender, setGender] = useState(props.me.gender ?? "");
  const [avatar, setAvatar] = useState<string | null>(props.me.avatarUrl ?? null);
  const [showWinProbability, setShowWinProbability] = useState<boolean>(props.me.showWinProbability === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Сброс при каждом открытии — чтобы при отмене не сохранять локальные изменения текста.
  useEffect(() => {
    if (props.open) {
      setName(props.me.name ?? "");
      setEmail(props.me.email ?? "");
      setGender(props.me.gender ?? "");
      setAvatar(props.me.avatarUrl ?? null);
      setShowWinProbability(props.me.showWinProbability === true);
      setError(null);
      setSaving(false);
    }
  }, [props.open, props.me]);

  const dirty =
    name.trim() !== (props.me.name ?? "") ||
    email.trim() !== (props.me.email ?? "") ||
    gender !== (props.me.gender ?? "");

  const initials = props.me.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

  const persistAvatar = async (next: string | null) => {
    setAvatar(next);
    setError(null);
    try {
      const updated = await api.updateAvatar(next);
      props.onSaved(updated);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось обновить аватар");
    }
  };

  const persistShowWinProbability = async (next: boolean) => {
    setShowWinProbability(next);
    setError(null);
    try {
      const updated = await api.updateProfile({ showWinProbability: next });
      props.onSaved(updated);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить настройку");
      // Откатим UI к серверному значению.
      setShowWinProbability(!next);
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: { name?: string; email?: string; gender?: string } = {};
      if (name.trim() && name.trim() !== (props.me.name ?? "")) payload.name = name.trim();
      if (email.trim() !== (props.me.email ?? "")) payload.email = email.trim();
      if (gender !== (props.me.gender ?? "")) payload.gender = gender;
      if (Object.keys(payload).length === 0) {
        props.onOpenChange(false);
        return;
      }
      const updated = await api.updateProfile(payload);
      props.onSaved(updated);
      props.onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-4rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактировать профиль</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Аватар — авто-сохранение при выборе. */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Аватар</div>
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-xl font-semibold shrink-0">
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="space-y-3 flex-1 min-w-0">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  Загрузить фото
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      compressAvatar(file)
                        .then(persistAvatar)
                        .catch((err: any) => setError(err?.message ?? "Ошибка обработки"));
                    }}
                  />
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[...BOY_AVATARS, ...GIRL_AVATARS].map((src) => (
                    <button
                      key={src}
                      type="button"
                      className={cn(
                        "h-10 w-10 rounded-full border transition-all",
                        avatar === src ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40"
                      )}
                      onClick={() => persistAvatar(src)}
                    >
                      <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Имя/email/пол. */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Имя</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Пол</label>
              <Select value={gender || "_unset"} onValueChange={(v) => setGender(v === "_unset" ? "" : v)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unset">Не указан</SelectItem>
                  <SelectItem value="M">М</SelectItem>
                  <SelectItem value="F">Ж</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Тоггл «показывать шансы» — авто-сохранение по клику. */}
          <label className="flex items-start justify-between gap-3 cursor-pointer rounded-md border border-border bg-background/50 hover:bg-background px-3 py-2.5 transition-colors">
            <div className="space-y-0.5 min-w-0">
              <div className="text-sm font-medium">Показывать шансы выигрыша</div>
              <div className="text-xs text-muted-foreground">
                В модале «Раунды» под каждым матчем будет полоска шансов и метка «Лёгкий фаворит» / «Равные шансы» и т.п. По Elo.
              </div>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary shrink-0"
              checked={showWinProbability}
              onChange={(e) => persistShowWinProbability(e.target.checked)}
            />
          </label>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
