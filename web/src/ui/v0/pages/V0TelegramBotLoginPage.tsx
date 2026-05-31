import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, MeResponse, setToken } from "@/lib/api";

type StatusResp = {
  status: "PENDING" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXPIRED";
  telegramName: string | null;
  telegramUsername: string | null;
  photoUrl: string | null;
  existingUser: boolean | null;
};

/**
 * Bot-login flow (UX вариант А — с inline-кнопкой подтверждения + формой регистрации):
 *  1. Юзер кликнул кнопку → POST /bot-login/start вернул token + deepLink
 *  2. window.open(deepLink) открыл Telegram чат с ботом
 *  3. Эта страница (URL: /auth/telegram-login?token=…&deepLink=…) поллит /status каждые 1.5 сек
 *  4. AWAITING_APPROVAL → показываем «бот спрашивает подтверждение, тапни Yes в Telegram»
 *  5. APPROVED + existingUser → автоматически вызываем complete и редиректим в /
 *  6. APPROVED + new user → показываем форму с предзаполненным именем (опц. email)
 *  7. REJECTED / EXPIRED → ошибка с кнопкой «Попробовать снова»
 */
export function V0TelegramBotLoginPage(props: { onAuth: (me: MeResponse) => void }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const deepLink = params.get("deepLink") ?? "";

  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  // Поля completion-формы — заполняются после APPROVED для нового юзера.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<string>("");
  const completedRef = useRef(false);

  // Поллинг.
  useEffect(() => {
    if (!token) {
      setError("Отсутствует токен — открой страницу через кнопку «Войти через Telegram».");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api.telegramBotLoginStatus(token);
        if (cancelled) return;
        setStatus(s);
        // Стоп-условия — больше не поллим.
        if (s.status === "REJECTED" || s.status === "EXPIRED") return;
        if (s.status === "APPROVED") return;
        // Иначе продолжаем
        scheduleNext();
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Не удалось получить статус");
      }
    };
    const scheduleNext = () => {
      window.setTimeout(() => {
        if (!cancelled) tick();
      }, 1500);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Когда APPROVED — для существующего юзера сразу complete + redirect.
  // Для нового — заполнить дефолтное имя из Telegram-данных и ждать сабмита формы.
  useEffect(() => {
    if (!status || status.status !== "APPROVED") return;
    if (completedRef.current) return;
    if (status.existingUser === true) {
      completedRef.current = true;
      autoComplete();
    } else {
      if (!name && status.telegramName) setName(status.telegramName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function autoComplete() {
    setCompleting(true);
    setError(null);
    try {
      const { token: jwt } = await api.telegramBotLoginComplete(token);
      setToken(jwt?.trim() || null);
      const me = await api.me();
      props.onAuth(me);
      nav(me.surveyCompleted ? "/" : "/survey", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Не удалось завершить вход");
      setCompleting(false);
      completedRef.current = false;
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Введите имя");
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      const { token: jwt } = await api.telegramBotLoginComplete(
        token,
        name.trim(),
        email.trim() || null,
      );
      setToken(jwt?.trim() || null);
      // Сохраним пол через updateProfile отдельным запросом — completeEndpoint не принимает gender.
      if (gender) {
        try {
          await api.updateProfile({ gender });
        } catch {
          /* не критично */
        }
      }
      const me = await api.me();
      props.onAuth(me);
      nav(me.surveyCompleted ? "/" : "/survey", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Не удалось завершить регистрацию");
      setCompleting(false);
    }
  }

  const renderWaiting = (text: string, sub?: string) => (
    <div className="flex flex-col items-center gap-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="text-base font-medium">{text}</div>
      {sub ? <div className="text-sm text-muted-foreground">{sub}</div> : null}
      {deepLink ? (
        <Button asChild variant="outline" size="sm">
          <a href={deepLink} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Открыть Telegram ещё раз
          </a>
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          {error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">Не получилось</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={() => nav("/login", { replace: true })}>На страницу входа</Button>
            </div>
          ) : status === null ? (
            renderWaiting("Готовим вход…")
          ) : status.status === "PENDING" ? (
            renderWaiting(
              "Открой Telegram и нажми «Start»",
              "Если Telegram не открылся автоматически — жми кнопку ниже.",
            )
          ) : status.status === "AWAITING_APPROVAL" ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex items-center gap-3">
                {status.photoUrl ? (
                  <img src={status.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center">
                    {(status.telegramName ?? "?").slice(0, 1)}
                  </div>
                )}
                <div className="text-left">
                  <div className="font-semibold">{status.telegramName ?? "Пользователь"}</div>
                  {status.telegramUsername ? (
                    <div className="text-xs text-muted-foreground">@{status.telegramUsername}</div>
                  ) : null}
                </div>
              </div>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-sm">Бот спрашивает у тебя подтверждение в Telegram</div>
              <div className="text-xs text-muted-foreground">Тапни «✅ Войти» в чате с ботом</div>
            </div>
          ) : status.status === "APPROVED" && status.existingUser === true ? (
            renderWaiting("Готово, заходим…")
          ) : status.status === "APPROVED" ? (
            // Новый юзер — completion-форма с предзаполненным именем из Telegram.
            <form onSubmit={submitForm} className="space-y-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <div className="text-lg font-semibold">Telegram подтвердил вход</div>
                <div className="text-sm text-muted-foreground">
                  Заверши регистрацию — дальше пройдёшь короткий опрос.
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Имя в Padix</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
                <div className="text-xs text-muted-foreground">Подгружено из Telegram, можно поменять.</div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email (опц.)</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="можно потом в настройках"
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
              <Button type="submit" disabled={completing} className="w-full">
                {completing ? "Создаём аккаунт…" : "Создать аккаунт"}
              </Button>
            </form>
          ) : status.status === "REJECTED" ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">Вход отменён</div>
              <div className="text-sm text-muted-foreground">Ты нажал «Отмена» в боте.</div>
              <Button onClick={() => nav("/login", { replace: true })}>На страницу входа</Button>
            </div>
          ) : (
            // EXPIRED
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-amber-500" />
              <div className="text-lg font-semibold">Ссылка истекла</div>
              <div className="text-sm text-muted-foreground">Токен живёт 5 минут.</div>
              <Button onClick={() => nav("/login", { replace: true })}>Начать заново</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
