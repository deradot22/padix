import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, MeResponse, setToken } from "@/lib/api";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "tgLogin.errNoToken": {
    ru: "Отсутствует токен — открой страницу через кнопку «Войти через Telegram».",
    en: "No token — open this page from the “Sign in with Telegram” button.",
  },
  "tgLogin.errStatus": { ru: "Не удалось получить статус", en: "Couldn't get the status" },
  "tgLogin.errComplete": { ru: "Не удалось завершить вход", en: "Couldn't finish signing in" },
  "tgLogin.errLink": { ru: "Не удалось привязать Telegram", en: "Couldn't link Telegram" },
  "tgLogin.errNameRequired": { ru: "Введите имя", en: "Enter your name" },
  "tgLogin.errSignup": { ru: "Не удалось завершить регистрацию", en: "Couldn't finish signing up" },
  "tgLogin.openAgain": { ru: "Открыть Telegram ещё раз", en: "Open Telegram again" },
  "tgLogin.checkEmail": { ru: "Проверь почту", en: "Check your email" },
  "tgLogin.emailTaken": {
    ru: "Этот email уже зарегистрирован в Padix. Чтобы убедиться, что это твой аккаунт, мы отправили подтверждение на",
    en: "This email is already registered with Padix. To make sure the account is yours, we sent a confirmation to",
  },
  "tgLogin.emailTakenHint": {
    ru: "Открой почту и нажми «Привязать Telegram» в письме — потом вернись сюда залогиненным.",
    en: "Open the email and hit “Link Telegram” — then come back here signed in.",
  },
  "tgLogin.emailTakenSpam": {
    ru: "Не нашёл письмо? Проверь спам или попробуй с другим email.",
    en: "No email? Check your spam folder, or try a different address.",
  },
  "tgLogin.changeEmail": { ru: "Изменить email", en: "Change email" },
  "tgLogin.failedTitle": { ru: "Не получилось", en: "Something went wrong" },
  "tgLogin.toLogin": { ru: "На страницу входа", en: "Back to sign-in" },
  "tgLogin.preparing": { ru: "Готовим вход…", en: "Getting things ready…" },
  "tgLogin.pendingTitle": { ru: "Открой Telegram и нажми «Start»", en: "Open Telegram and hit “Start”" },
  "tgLogin.pendingHint": {
    ru: "Если Telegram не открылся автоматически — жми кнопку ниже.",
    en: "If Telegram didn't open on its own, use the button below.",
  },
  "tgLogin.userFallback": { ru: "Пользователь", en: "User" },
  "tgLogin.awaitingTitle": {
    ru: "Бот спрашивает у тебя подтверждение в Telegram",
    en: "The bot is asking you to confirm in Telegram",
  },
  "tgLogin.awaitingHint": { ru: "Тапни «✅ Войти» в чате с ботом", en: "Tap “✅ Sign in” in the chat with the bot" },
  "tgLogin.linking": { ru: "Привязываем Telegram…", en: "Linking Telegram…" },
  "tgLogin.signingIn": { ru: "Готово, заходим…", en: "All set, signing you in…" },
  "tgLogin.approvedTitle": { ru: "Telegram подтвердил вход", en: "Telegram confirmed it's you" },
  "tgLogin.approvedHint": {
    ru: "Заверши регистрацию — дальше пройдёшь короткий опрос.",
    en: "Finish signing up — a short survey comes next.",
  },
  "tgLogin.nameLabel": { ru: "Имя в Padix", en: "Name in Padix" },
  "tgLogin.nameHint": { ru: "Подгружено из Telegram, можно поменять.", en: "Pulled from Telegram, feel free to change it." },
  "tgLogin.emailLabel": { ru: "Email (опц.)", en: "Email (optional)" },
  "tgLogin.emailPlaceholder": { ru: "можно потом в настройках", en: "you can add it later in settings" },
  "tgLogin.genderLabel": { ru: "Пол", en: "Gender" },
  "tgLogin.genderUnset": { ru: "Не указан", en: "Not set" },
  "tgLogin.genderM": { ru: "М", en: "M" },
  "tgLogin.genderF": { ru: "Ж", en: "F" },
  "tgLogin.creating": { ru: "Создаём аккаунт…", en: "Creating account…" },
  "tgLogin.create": { ru: "Создать аккаунт", en: "Create account" },
  "tgLogin.rejectedTitle": { ru: "Вход отменён", en: "Sign-in cancelled" },
  "tgLogin.rejectedHint": { ru: "Ты нажал «Отмена» в боте.", en: "You tapped “Cancel” in the bot." },
  "tgLogin.expiredTitle": { ru: "Ссылка истекла", en: "Link expired" },
  "tgLogin.expiredHint": { ru: "Токен живёт 5 минут.", en: "A token is only good for 5 minutes." },
  "tgLogin.restart": { ru: "Начать заново", en: "Start over" },
} satisfies Dict;

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
  const { t } = useI18n(TR);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const deepLink = params.get("deepLink") ?? "";
  // mode=link — юзер УЖЕ залогинен и привязывает TG к своему аккаунту.
  // Логика отличается: после APPROVED идём в /bot-link/complete, обновляем me,
  // редиректим в /settings (а не /survey или /).
  const linkMode = params.get("mode") === "link";

  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  // Поля completion-формы — заполняются после APPROVED для нового юзера.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<string>("");
  const completedRef = useRef(false);
  // Когда юзер ввёл email который уже зарегистрирован — бэк прислал confirm-link на почту.
  const [emailConfirmSent, setEmailConfirmSent] = useState<string | null>(null);

  // Поллинг.
  useEffect(() => {
    if (!token) {
      setError(t("tgLogin.errNoToken"));
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
        setError(e?.message ?? t("tgLogin.errStatus"));
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
    // t намеренно вне зависимостей: смена языка не должна перезапускать поллинг.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Когда APPROVED — для существующего юзера сразу complete + redirect.
  // Для нового — заполнить дефолтное имя из Telegram-данных и ждать сабмита формы.
  // Для link-mode — всегда auto-complete: создаём не юзера, а связку TG↔user.
  useEffect(() => {
    if (!status || status.status !== "APPROVED") return;
    if (completedRef.current) return;
    if (linkMode) {
      completedRef.current = true;
      autoCompleteLink();
    } else if (status.existingUser === true) {
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
      const r = await api.telegramBotLoginComplete(token);
      // existing user — JWT приходит сразу, без email-collision сценария.
      if (r.token) {
        setToken(r.token.trim() || null);
        const me = await api.me();
        props.onAuth(me);
        nav(me.surveyCompleted ? "/" : "/survey", { replace: true });
      }
    } catch (e: any) {
      setError(e?.message ?? t("tgLogin.errComplete"));
      setCompleting(false);
      completedRef.current = false;
    }
  }

  /** Link-flow: юзер уже залогинен, привязываем TG к его аккаунту. JWT не меняется. */
  async function autoCompleteLink() {
    setCompleting(true);
    setError(null);
    try {
      const updatedMe = await api.telegramBotLinkComplete(token);
      props.onAuth(updatedMe);
      nav("/settings", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? t("tgLogin.errLink"));
      setCompleting(false);
      completedRef.current = false;
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("tgLogin.errNameRequired"));
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      const r = await api.telegramBotLoginComplete(
        token,
        name.trim(),
        email.trim() || null,
      );
      if (r.awaitingEmailConfirm) {
        // Email уже занят → бэк послал confirm-link на этот email. Переключаем UI.
        setEmailConfirmSent(r.awaitingEmailConfirm.emailSentTo);
        setCompleting(false);
        return;
      }
      if (r.token) {
        setToken(r.token.trim() || null);
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
      }
    } catch (e: any) {
      setError(e?.message ?? t("tgLogin.errSignup"));
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
            {t("tgLogin.openAgain")}
          </a>
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          {emailConfirmSent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Mail className="h-12 w-12 text-primary" />
              <div className="text-lg font-semibold">{t("tgLogin.checkEmail")}</div>
              <div className="text-sm text-muted-foreground">
                {t("tgLogin.emailTaken")} <span className="font-mono">{emailConfirmSent}</span>.
              </div>
              <div className="text-sm text-muted-foreground">
                {t("tgLogin.emailTakenHint")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("tgLogin.emailTakenSpam")}
              </div>
              <Button variant="outline" onClick={() => setEmailConfirmSent(null)}>
                {t("tgLogin.changeEmail")}
              </Button>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">{t("tgLogin.failedTitle")}</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={() => nav("/login", { replace: true })}>{t("tgLogin.toLogin")}</Button>
            </div>
          ) : status === null ? (
            renderWaiting(t("tgLogin.preparing"))
          ) : status.status === "PENDING" ? (
            renderWaiting(t("tgLogin.pendingTitle"), t("tgLogin.pendingHint"))
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
                  <div className="font-semibold">{status.telegramName ?? t("tgLogin.userFallback")}</div>
                  {status.telegramUsername ? (
                    <div className="text-xs text-muted-foreground">@{status.telegramUsername}</div>
                  ) : null}
                </div>
              </div>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-sm">{t("tgLogin.awaitingTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("tgLogin.awaitingHint")}</div>
            </div>
          ) : status.status === "APPROVED" && linkMode ? (
            // Link-mode: бэк сейчас линкует TG к текущему юзеру, форма регистрации не нужна.
            // ВАЖНО: эта ветка должна идти ПЕРЕД проверкой existingUser, иначе у юзера
            // с новым (ещё не привязанным) TG на долю секунды промелькнёт «регистрация».
            renderWaiting(t("tgLogin.linking"))
          ) : status.status === "APPROVED" && status.existingUser === true ? (
            renderWaiting(t("tgLogin.signingIn"))
          ) : status.status === "APPROVED" ? (
            // Новый юзер — completion-форма с предзаполненным именем из Telegram.
            <form onSubmit={submitForm} className="space-y-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <div className="text-lg font-semibold">{t("tgLogin.approvedTitle")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("tgLogin.approvedHint")}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("tgLogin.nameLabel")}</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
                <div className="text-xs text-muted-foreground">{t("tgLogin.nameHint")}</div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("tgLogin.emailLabel")}</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("tgLogin.emailPlaceholder")}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("tgLogin.genderLabel")}</label>
                <Select value={gender || "_unset"} onValueChange={(v) => setGender(v === "_unset" ? "" : v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_unset">{t("tgLogin.genderUnset")}</SelectItem>
                    <SelectItem value="M">{t("tgLogin.genderM")}</SelectItem>
                    <SelectItem value="F">{t("tgLogin.genderF")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={completing} className="w-full">
                {completing ? t("tgLogin.creating") : t("tgLogin.create")}
              </Button>
            </form>
          ) : status.status === "REJECTED" ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-rose-500" />
              <div className="text-lg font-semibold">{t("tgLogin.rejectedTitle")}</div>
              <div className="text-sm text-muted-foreground">{t("tgLogin.rejectedHint")}</div>
              <Button onClick={() => nav("/login", { replace: true })}>{t("tgLogin.toLogin")}</Button>
            </div>
          ) : (
            // EXPIRED
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-amber-500" />
              <div className="text-lg font-semibold">{t("tgLogin.expiredTitle")}</div>
              <div className="text-sm text-muted-foreground">{t("tgLogin.expiredHint")}</div>
              <Button onClick={() => nav("/login", { replace: true })}>{t("tgLogin.restart")}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
