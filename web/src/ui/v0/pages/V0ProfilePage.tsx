import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, EventHistoryItem, EventHistoryMatch, EventInviteItem, FriendsSnapshot, hasToken } from "../../../lib/api";
import { ntrpLevel } from "../../../lib/rating";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerTooltip } from "@/components/player-tooltip";
import { RatingGraph } from "@/components/rating-graph";
import {
  Calendar,
  CheckCircle,
  Clock,
  Gamepad2,
  Hash,
  Mail,
  MapPin,
  Pencil,
  Upload,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  UserPlus,
  Users,
  Users2,
  X,
  XCircle,
} from "lucide-react";

function formatPublicId(publicId?: string | null) {
  if (!publicId) return null;
  const trimmed = publicId.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function isPastDate(dateStr: string) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  return dateStr < todayIso;
}

export function V0ProfilePage(props: { me: any; meLoaded?: boolean; onMeUpdate?: (me: any) => void }) {
  const nav = useNavigate();
  const [meLive, setMeLive] = useState<any | null>(null);
  const [friends, setFriends] = useState<FriendsSnapshot | null>(null);
  const [friendInput, setFriendInput] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [invites, setInvites] = useState<EventInviteItem[] | null>(null);
  const [inviteEventJoined, setInviteEventJoined] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<EventHistoryItem[] | null>(null);
  const [details, setDetails] = useState<EventHistoryMatch[] | null>(null);
  const [detailsTitle, setDetailsTitle] = useState<string | null>(null);
  const [detailsEventId, setDetailsEventId] = useState<string | null>(null);
  const [detailsStatsOpen, setDetailsStatsOpen] = useState(false);
  const [detailsStats, setDetailsStats] = useState<{ id: string; name: string; points: number }[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [acceptedInvites, setAcceptedInvites] = useState<Record<string, boolean>>({});
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [ratingHistory, setRatingHistory] = useState<{ date: string; rating: number; delta: number | null }[]>([]);
  const [graphOpen, setGraphOpen] = useState(false);

  const persistAvatar = async (next: string | null) => {
    setAvatar(next);
    try {
      const updated = await api.updateAvatar(next);
      setMeLive(updated);
      if (updated.avatarUrl) setAvatar(updated.avatarUrl);
      else if (!next) setAvatar(null);
    } catch (e: any) {
      setInfo(e?.message ?? "Ошибка обновления аватара");
    }
  };

  const compressAvatar = (file: File, maxSize = 256, quality = 0.8): Promise<string> =>
    new Promise((resolve, reject) => {
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

  const boyAvatars = useMemo(
    () => [
      "https://api.dicebear.com/8.x/avataaars/png?seed=boy1",
      "https://api.dicebear.com/8.x/avataaars/png?seed=boy2",
      "https://api.dicebear.com/8.x/avataaars/png?seed=boy3",
      "https://api.dicebear.com/8.x/avataaars/png?seed=boy4",
      "https://api.dicebear.com/8.x/avataaars/png?seed=boy5",
    ],
    [],
  );

  const girlAvatars = useMemo(
    () => [
      "https://api.dicebear.com/8.x/avataaars/png?seed=girl1",
      "https://api.dicebear.com/8.x/avataaars/png?seed=girl2",
      "https://api.dicebear.com/8.x/avataaars/png?seed=girl3",
      "https://api.dicebear.com/8.x/avataaars/png?seed=girl4",
      "https://api.dicebear.com/8.x/avataaars/png?seed=girl5",
    ],
    [],
  );

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);

  useEffect(() => {
    if (!idCopied) return;
    const id = window.setTimeout(() => setIdCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [idCopied]);

  useEffect(() => {
    if (!info) return;
    const id = window.setTimeout(() => setInfo(null), 5000);
    return () => window.clearTimeout(id);
  }, [info]);

  useEffect(() => {
    if (!props.me) return;
    api
      .me()
      .then((m) => {
        setMeLive(m);
        setAvatar(m.avatarUrl ?? null);
      })
      .catch(() => setMeLive(null));
  }, [props.me]);

  useEffect(() => {
    if (!props.me) return;
    setFriendError(null);
    api
      .getFriends()
      .then(setFriends)
      .catch((e: any) => setFriendError(e?.message ?? "Ошибка друзей"));
    api
      .getInvites()
      .then(setInvites)
      .catch(() => setInvites([]));
  }, [props.me]);

  useEffect(() => {
    if (!props.me?.playerId) return;
    const items = invites ?? [];
    if (items.length === 0) {
      setInviteEventJoined(new Set());
      return;
    }
    let cancelled = false;
    Promise.all(items.map((inv) => api.getEventDetails(inv.eventId)))
      .then((details) => {
        if (cancelled) return;
        const joined = new Set<string>();
        details.forEach((d) => {
          const meId = props.me?.playerId;
          const hasMe =
            !!meId &&
            (d.registeredPlayers ?? []).some((p) => p.id === meId);
          if (hasMe) joined.add(d.event.id);
        });
        setInviteEventJoined(joined);
      })
      .catch(() => {
        if (!cancelled) setInviteEventJoined(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [invites, props.me?.playerId]);

  useEffect(() => {
    if (!props.me) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    api
      .myHistory()
      .then((d) => {
        if (cancelled) return;
        setHistory(d as EventHistoryItem[]);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setHistoryError(e?.message ?? "Ошибка");
      })
      .finally(() => {
        if (cancelled) return;
        setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.me]);

  useEffect(() => {
    if (!props.me?.playerId || !hasToken()) return;
    let cancelled = false;
    api
      .getRatingHistory()
      .then((h) => { if (!cancelled) setRatingHistory(h); })
      .catch(() => { if (!cancelled) setRatingHistory([]); });
    return () => { cancelled = true; };
  }, [props.me?.playerId]);

  const historyContent = useMemo(() => {
    if (historyLoading) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
    if (historyError)
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Не удалось загрузить: {historyError}
        </div>
      );
    if (!history?.length) return <div className="text-sm text-muted-foreground">История пуста — сыграй первый матч.</div>;

    const items = history.slice(0, 5);
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 pr-6 font-semibold">Дата</th>
              <th className="pb-3 pr-6 font-semibold">Событие</th>
              <th className="pb-3 pr-6 font-semibold">Матчей</th>
              <th className="pb-3 pr-6 font-semibold">Очки</th>
              <th className="pb-3 font-semibold">Рейтинг</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((it) => (
              <tr
                key={it.eventId}
                className="group transition-colors hover:bg-secondary/30 cursor-pointer"
                onClick={async () => {
                  try {
                    const res = await api.myHistoryEvent(it.eventId);
                    setDetails(res);
                    setDetailsEventId(it.eventId);
                    setDetailsStatsOpen(false);
                    setDetailsStats([]);
                    const timeStr = it.eventStartTime
                      ? ` ${it.eventStartTime.slice(0, 5)}${it.eventEndTime ? "–" + it.eventEndTime.slice(0, 5) : ""}`
                      : "";
                    setDetailsTitle(it.eventTitle + timeStr);
                  } catch (err: any) {
                    setHistoryError(err?.message ?? "Ошибка");
                  }
                }}
              >
                <td className="py-4 pr-6 text-sm text-muted-foreground font-medium">
                  <div>{it.eventDate}</div>
                  {it.eventStartTime ? (
                    <div className="text-xs">
                      {it.eventStartTime.slice(0, 5)}
                      {it.eventEndTime ? `–${it.eventEndTime.slice(0, 5)}` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="py-4 pr-6">
                  <div className="font-semibold">{it.eventTitle}</div>
                  {it.participants?.length ? (
                    <div className="text-xs text-muted-foreground mt-0.5 max-w-[260px] truncate">
                      {it.participants.join(", ")}
                    </div>
                  ) : null}
                </td>
                <td className="py-4 pr-6 text-sm tabular-nums font-medium">{it.matchesCount}</td>
                <td className="py-4 pr-6 text-sm tabular-nums font-semibold">
                  {it.totalPoints ?? "—"}
                  {it.totalPoints == null ? "" : " pts"}
                </td>
                <td className="py-4">
                  {it.ratingDelta >= 0 ? (
                    <Badge className="gap-1.5 bg-primary/20 text-primary border-primary/30 border">
                      <TrendingUp className="h-3.5 w-3.5" />
                      +{it.ratingDelta}
                    </Badge>
                  ) : (
                    <Badge className="gap-1.5 bg-destructive/20 text-destructive border-destructive/30 border">
                      <TrendingDown className="h-3.5 w-3.5" />
                      {it.ratingDelta}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [history, historyError, historyLoading]);

  if (!props.me) {
    if (!props.meLoaded) {
      return <div className="text-sm text-muted-foreground">Загрузка…</div>;
    }
    return (
      <div className="space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">Профиль</h1>
        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="text-lg font-semibold">Нужно войти</div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => nav("/login")}>Войти</Button>
              <Button variant="outline" onClick={() => nav("/register")}>
                Регистрация
              </Button>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">Профиль доступен после авторизации.</div>
          </CardContent>
        </Card>
      </div>
    );
  }
  const viewMe = meLive ?? props.me;
  const calibration = (viewMe.calibrationEventsRemaining ?? 0) > 0;

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">Профиль</h1>

        <Card className="overflow-hidden border-border/50">
          <div className="h-32 bg-gradient-to-r from-primary/30 via-primary/15 to-accent/10" />
          <CardContent className="-mt-16 pb-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-background bg-gradient-to-br from-primary/20 to-primary/5 shadow-xl">
                  <button
                    type="button"
                    className="group relative h-full w-full rounded-2xl overflow-hidden"
                    onClick={() => setAvatarOpen(true)}
                    aria-label="Изменить аватар"
                  >
                    {avatar ? (
                      <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <User className="h-12 w-12 text-primary" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Изменить
                    </div>
                  </button>
                </div>
                <div>
                  <h2 className="text-3xl font-bold">{viewMe.name}</h2>
                  <p className="flex items-center gap-2 text-muted-foreground mt-1">
                    <Mail className="h-4 w-4" />
                    {viewMe.email}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditName(viewMe.name ?? "");
                  setEditEmail(viewMe.email ?? "");
                  setEditPassword("");
                  setEditGender(viewMe.gender ?? "");
                  setEditError(null);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Редактировать профиль
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Badge className="gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 text-base">
                <Trophy className="h-4 w-4" />
                {calibration ? (
                  "на калибровке"
                ) : (
                  <>
                    {viewMe.rating} (NTRP {ntrpLevel(viewMe.rating)})
                  </>
                )}
              </Badge>
              <Badge className="gap-2 px-4 py-2 bg-accent/10 text-accent border border-accent/20 text-base">
                <Gamepad2 className="h-4 w-4" />
                {viewMe.gamesPlayed} матчей
              </Badge>
              {viewMe.gender ? (
                <Badge variant="secondary" className="gap-2 px-4 py-2 text-base">
                  {viewMe.gender === "M" ? "М" : "Ж"}
                </Badge>
              ) : null}
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex"
                  onClick={async () => {
                    const pid = formatPublicId(viewMe.publicId);
                    if (!pid) return;
                    try {
                      await navigator.clipboard.writeText(pid);
                      setIdCopied(true);
                    } catch {
                      setInfo(pid);
                    }
                  }}
                  aria-label="Скопировать ID"
                  title="Скопировать ID"
                >
                  <Badge variant="secondary" className="gap-2 px-4 py-2">
                    <span className="text-xs uppercase text-muted-foreground">ID</span>
                    {formatPublicId(viewMe.publicId)}
                  </Badge>
                </button>
                <span
                  className={cn(
                    "pointer-events-none absolute -top-2 right-0 translate-y-[-100%] rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-300 transition-all duration-200",
                    idCopied ? "opacity-100 translate-y-[-110%]" : "opacity-0 translate-y-[-80%]",
                  )}
                >
                  Скопировано
                </span>
              </div>
            </div>

            {calibration ? (
              <div className="mt-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-200">
                  Рейтинг в <strong>калибровке</strong> — осталось <strong>{viewMe.calibrationEventsRemaining}</strong>{" "}
                  игра(ы) до финализации
                </p>
              </div>
            ) : null}

            <Dialog open={avatarOpen} onOpenChange={setAvatarOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Выбор аватара</DialogTitle>
                </DialogHeader>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">Загрузить своё фото или выбрать готовый аватар</div>
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
                          .then((result) => persistAvatar(result))
                          .catch((err: any) => {
                            setInfo(err?.message ?? "Не удалось обработать изображение");
                          });
                      }}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4">
                  <div>
                    <div className="grid grid-cols-5 gap-2">
                      {boyAvatars.map((src, idx) => (
                        <button
                          key={`boy-${idx}`}
                          type="button"
                          className={`h-12 w-12 rounded-full border ${
                            avatar === src ? "border-primary ring-2 ring-primary/40" : "border-border"
                          }`}
                          onClick={() => {
                            persistAvatar(src);
                          }}
                        >
                          <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="grid grid-cols-5 gap-2">
                      {girlAvatars.map((src, idx) => (
                        <button
                          key={`girl-${idx}`}
                          type="button"
                          className={`h-12 w-12 rounded-full border ${
                            avatar === src ? "border-primary ring-2 ring-primary/40" : "border-border"
                          }`}
                          onClick={() => {
                            persistAvatar(src);
                          }}
                        >
                          <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Редактировать профиль</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setEditLoading(true);
                    setEditError(null);
                    try {
                      const payload: { name?: string; email?: string; password?: string; gender?: string } = {};
                      if (editName.trim()) payload.name = editName.trim();
                      if (editEmail.trim()) payload.email = editEmail.trim();
                      if (editPassword) payload.password = editPassword;
                      if (editGender) payload.gender = editGender;
                      const updated = await api.updateProfile(payload);
                      setMeLive(updated);
                      props.onMeUpdate?.(updated);
                      setEditOpen(false);
                    } catch (err: any) {
                      setEditError(err?.message ?? "Ошибка");
                    } finally {
                      setEditLoading(false);
                    }
                  }}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Имя</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Имя"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@example.com"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Новый пароль (оставьте пустым, чтобы не менять)</label>
                    <Input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Пол</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                    >
                      <option value="">Не указан</option>
                      <option value="M">М</option>
                      <option value="F">Ж</option>
                    </select>
                  </div>
                  {editError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {editError}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={editLoading}>
                      {editLoading ? "Сохранение…" : "Сохранить"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                      Отмена
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <div className="grid gap-8 lg:grid-cols-3 items-stretch">
          <Card className="lg:col-span-2 border-border/50 flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-6 w-6 text-primary" />
                Приглашения в игры
              </CardTitle>
              <CardDescription>
                {(invites ?? [])
                  .filter((inv) => !isPastDate(inv.eventDate))
                  .filter((inv) => !inviteEventJoined.has(inv.eventId)).length}{" "}
                новых приглашений
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 flex-1">
              {(invites ?? [])
                .filter((inv) => !isPastDate(inv.eventDate))
                .filter((inv) => !inviteEventJoined.has(inv.eventId)).length === 0 ? (
                <div className="text-sm text-muted-foreground">Пока приглашений нет.</div>
              ) : (
                (invites ?? [])
                  .filter((inv) => !isPastDate(inv.eventDate))
                  .filter((inv) => !inviteEventJoined.has(inv.eventId))
                  .map((invite) => {
                  const key = `${invite.eventId}-${invite.fromPublicId}`;
                  const accepted = acceptedInvites[key];
                  return (
                    <Card key={key} className="overflow-hidden transition-all border-2">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-semibold text-lg">{invite.eventTitle}</h3>
                                <p className="text-sm text-muted-foreground">
                                  Организатор: <strong>{invite.fromName}</strong>
                                </p>
                              </div>
                              {accepted ? (
                                <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 border">
                                  <CheckCircle className="h-3 w-3" />
                                  Принято
                                </Badge>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-3 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="h-4 w-4 text-primary" />
                                {invite.eventDate}
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Users2 className="h-4 w-4 text-primary" />
                                {invite.fromPublicId}
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4 text-primary" />
                                —
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 sm:flex-col">
                            <Button
                              onClick={async () => {
                                setInviteActionId(key);
                                try {
                                  await api.acceptEventInvite(invite.eventId);
                                  setAcceptedInvites((m) => ({ ...m, [key]: true }));
                                  const refreshed = await api.getInvites();
                                  setInvites(refreshed ?? []);
                                } catch (e: any) {
                                  setHistoryError(e?.message ?? "Ошибка");
                                } finally {
                                  setInviteActionId(null);
                                }
                              }}
                              disabled={inviteActionId === key}
                              className={
                                accepted
                                  ? "gap-2 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
                                  : "gap-2 bg-primary text-primary-foreground"
                              }
                            >
                              <CheckCircle className="h-4 w-4" />
                              <span>{accepted ? "Принято" : "Принять"}</span>
                            </Button>
                            <Button
                              variant="outline"
                              disabled={inviteActionId === key}
                              onClick={async () => {
                                setInviteActionId(key);
                                try {
                                  await api.declineEventInvite(invite.eventId);
                                  const refreshed = await api.getInvites();
                                  setInvites(refreshed ?? []);
                                } catch (e: any) {
                                  setHistoryError(e?.message ?? "Ошибка");
                                } finally {
                                  setInviteActionId(null);
                                }
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" onClick={() => nav(`/events/${invite.eventId}`)}>
                              Открыть
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Друзья
              </CardTitle>
              <CardDescription>Добавьте друзей по их ID</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="flex gap-2">
                <Input
                  placeholder="#123456789"
                  value={friendInput}
                  onChange={(e) => setFriendInput(e.target.value)}
                  className="bg-secondary border-border h-10"
                />
                <Button
                  className="px-4"
                  size="icon"
                  disabled={friendLoading || friendInput.trim().length === 0}
                  onClick={async () => {
                    setFriendLoading(true);
                    setFriendError(null);
                    try {
                      await api.requestFriend(friendInput);
                      setFriendInput("");
                      const updated = await api.getFriends();
                      setFriends(updated);
                      setInfo("Заявка отправлена");
                    } catch (err: any) {
                      const msg = err?.message ?? "Ошибка отправки";
                      if (typeof msg === "string" && msg.toLowerCase().includes("already")) {
                        setFriendError("Заявка уже отправлена");
                      } else {
                        setFriendError(msg);
                      }
                    } finally {
                      setFriendLoading(false);
                    }
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>

              {friendError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{friendError}</div>
              ) : null}
              {info ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {info}
                </div>
              ) : null}

              {(friends?.friends ?? []).length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Ваши друзья</p>
                  {(friends?.friends ?? []).map((friend) => (
                    <PlayerTooltip
                      key={friend.userId}
                      player={{
                        id: friend.userId,
                        name: friend.name,
                        rating: friend.rating,
                        matches: friend.gamesPlayed,
                        ntrp: friend.ntrp,
                        odid: friend.publicId,
                        avatarUrl: friend.avatarUrl,
                      }}
                      showAddFriend={false}
                    >
                      <div className="flex items-center gap-3 rounded-lg bg-secondary/50 p-2 px-3 cursor-pointer hover:bg-secondary transition-colors">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-sm font-semibold">
                          {friend.avatarUrl ? (
                            <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            friend.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{friend.name}</p>
                          <p className="text-xs text-muted-foreground">{friend.rating} • {friend.ntrp ?? ntrpLevel(friend.rating)}</p>
                        </div>
                      </div>
                    </PlayerTooltip>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Пока нет друзей.</div>
              )}

              {(friends?.incoming ?? []).length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Входящие заявки</p>
                  {(friends?.incoming ?? []).map((r) => (
                    <div key={r.publicId} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 p-2 px-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-sm font-semibold">
                          {r.avatarUrl ? (
                            <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            r.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{r.name}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            await api.acceptFriend(r.publicId);
                            const updated = await api.getFriends();
                            setFriends(updated);
                          }}
                        >
                          Принять
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await api.declineFriend(r.publicId);
                            const updated = await api.getFriends();
                            setFriends(updated);
                          }}
                        >
                          Отклонить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {ratingHistory.length > 1 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <Button variant="ghost" className="w-full justify-between" onClick={() => setGraphOpen((o) => !o)}>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  График рейтинга
                </CardTitle>
                <span className="text-muted-foreground">{graphOpen ? "−" : "+"}</span>
              </Button>
            </CardHeader>
            {graphOpen && (
              <CardContent>
                <RatingGraph points={ratingHistory} />
              </CardContent>
            )}
          </Card>
        )}

        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              История матчей
            </CardTitle>
            <CardDescription>История ваших игр и изменение рейтинга</CardDescription>
          </CardHeader>
          <CardContent>{historyContent}</CardContent>
        </Card>

        {details ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => { setDetails(null); setDetailsStatsOpen(false); }}>
            <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold">
                  {detailsTitle}{" "}
                  {details?.[0]?.eventStartTime ? (
                    <span className="text-sm text-muted-foreground">
                      {details[0].eventStartTime.slice(0, 5)}
                      {details[0].eventEndTime ? `–${details[0].eventEndTime.slice(0, 5)}` : ""}
                      {" "}{details[0].eventDate}
                    </span>
                  ) : details?.[0]?.eventDate ? (
                    <span className="text-sm text-muted-foreground">{details[0].eventDate}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      if (detailsStatsOpen) {
                        setDetailsStatsOpen(false);
                        return;
                      }
                      if (detailsStats.length > 0) {
                        setDetailsStatsOpen(true);
                        return;
                      }
                      if (!detailsEventId) return;
                      try {
                        const d = await api.getEventDetails(detailsEventId);
                        const totals = new Map<string, { id: string; name: string; points: number }>();
                        d.rounds.flatMap((r: any) => r.matches).forEach((m: any) => {
                          const score = m.score;
                          if (!score || score.mode !== "POINTS") return;
                          const ptsA = score.points?.teamAPoints ?? 0;
                          const ptsB = score.points?.teamBPoints ?? 0;
                          m.teamA.forEach((p: any) => {
                            if (!p?.id) return;
                            const row = totals.get(p.id) ?? { id: p.id, name: p.name, points: 0 };
                            row.points += ptsA;
                            totals.set(p.id, row);
                          });
                          m.teamB.forEach((p: any) => {
                            if (!p?.id) return;
                            const row = totals.get(p.id) ?? { id: p.id, name: p.name, points: 0 };
                            row.points += ptsB;
                            totals.set(p.id, row);
                          });
                        });
                        const rows = Array.from(totals.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
                        setDetailsStats(rows);
                        setDetailsStatsOpen(true);
                      } catch {}
                    }}
                  >
                    <Trophy className="h-4 w-4 mr-1.5" />
                    Статистика
                  </Button>
                  <Button variant="outline" onClick={() => { setDetails(null); setDetailsStatsOpen(false); }}>
                    Закрыть
                  </Button>
                </div>
              </div>

              {detailsStatsOpen && detailsStats.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {detailsStats.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 px-3 py-2"
                    >
                      <div className="text-sm font-medium">{row.name}</div>
                      <div className="text-sm font-semibold">{row.points}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-sm uppercase tracking-wider text-muted-foreground">
                      <th className="pb-3 pr-6 font-medium">Раунд</th>
                      <th className="pb-3 pr-6 font-medium">Корт</th>
                      <th className="pb-3 pr-6 font-medium">Пара</th>
                      <th className="pb-3 pr-6 font-medium">Соперники</th>
                      <th className="pb-3 pr-6 font-medium">Счёт</th>
                      <th className="pb-3 pr-6 font-medium">Исход</th>
                      <th className="pb-3 font-medium">Рейтинг</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {details.map((it) => (
                      <tr key={it.matchId} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-3 pr-6">{it.roundNumber}</td>
                        <td className="py-3 pr-6">{it.courtNumber}</td>
                        <td className="py-3 pr-6">{it.teamText}</td>
                        <td className="py-3 pr-6">{it.opponentText}</td>
                        <td className="py-3 pr-6">{it.score ?? "—"}</td>
                        <td className="py-3 pr-6">
                          <span className="text-muted-foreground">{it.result}</span>
                        </td>
                        <td className="py-3">
                          {it.ratingDelta == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : it.ratingDelta >= 0 ? (
                            <Badge className="gap-1.5 bg-primary/20 text-primary border-primary/30 border">
                              <TrendingUp className="h-3.5 w-3.5" />
                              +{it.ratingDelta}
                            </Badge>
                          ) : (
                            <Badge className="gap-1.5 bg-destructive/20 text-destructive border-destructive/30 border">
                              <TrendingDown className="h-3.5 w-3.5" />
                              {it.ratingDelta}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

