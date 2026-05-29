import { Button } from "@/components/ui/button";

/**
 * Кнопка «Войти через Telegram». Использует redirect-flow (как у Twitter), а не iframe-виджет.
 *
 * Почему redirect, а не виджет:
 *   - Виджет с iframe требует popup (window.open), который часто блокируется браузерами.
 *   - Кастомизировать дизайн виджета невозможно; overlay-обходы (прозрачный iframe поверх своей
 *     иконки) хрупкие — реальная синяя кнопка может оказаться вне видимой области.
 *   - Redirect-flow надёжен: oauth.telegram.org обрабатывает auth полностью, потом возвращает
 *     на наш callback с #tgAuthResult=base64-payload.
 *
 * Flow:
 *   1. Клик → window.location = `https://oauth.telegram.org/auth?bot_id=...&origin=...&return_to=...&request_access=write`
 *   2. Telegram показывает свою auth-страницу (надо разрешить на твоём телефоне)
 *   3. Telegram редиректит на `${return_to}#tgAuthResult={base64-encoded JSON}`
 *   4. Страница /auth/telegram-callback парсит payload и логинит юзера через /api/auth/telegram
 */
export function TelegramLoginButton(props: {
  botId: number;
  /** @username бота — пока не используется (для будущей миграции если Telegram даст deep-link). */
  botUsername?: string;
  /**
   * "login" (по-умолчанию) — обычный вход/регистрация.
   * "link" — привязка к текущему юзеру (из Настроек). В этом случае return_to получает ?link=true,
   *  и callback-страница вызывает /api/me/auth/telegram/link вместо /api/auth/telegram.
   */
  mode?: "login" | "link";
}) {
  const handleClick = () => {
    const origin = window.location.origin;
    const linkSuffix = props.mode === "link" ? "?link=true" : "";
    const returnTo = `${origin}/auth/telegram-callback${linkSuffix}`;
    const url = `https://oauth.telegram.org/auth?bot_id=${props.botId}&origin=${encodeURIComponent(origin)}&return_to=${encodeURIComponent(returnTo)}&request_access=write`;
    window.location.href = url;
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      title="Войти через Telegram"
      className="h-10 w-10 p-0 flex items-center justify-center rounded-md border border-border bg-secondary/40 text-primary transition-colors hover:bg-secondary/60"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    </Button>
  );
}
