import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * Кнопка «Войти через Telegram» — bot-login flow.
 *
 * Поток:
 *   1. POST /api/auth/telegram/bot-login/start → {token, deepLink, botUsername}
 *   2. window.open(deepLink) — открывает Telegram чат с ботом
 *   3. navigate(/auth/telegram-login?token=…&deepLink=…) — на странице polling + UI
 *
 * При закрытии (или блокировке) попапа браузером даём текстовую ссылку как fallback
 * для ручного открытия Telegram.
 */
export function TelegramLoginButton(props: {
  /** Сохранён для совместимости с предыдущим API; в текущем flow не используется. */
  botId?: number;
  /** Сохранён для совместимости. */
  botUsername?: string;
  /** "link" — привязка к существующему юзеру. Реализуется отдельно (TODO). */
  mode?: "login" | "link";
}) {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await api.telegramBotLoginStart();
      // Открываем Telegram в новой вкладке (или активирует Telegram-app на мобиле).
      window.open(r.deepLink, "_blank", "noopener,noreferrer");
      // Перенаправляем юзера на waiting-страницу с polling'ом.
      nav(`/auth/telegram-login?token=${encodeURIComponent(r.token)}&deepLink=${encodeURIComponent(r.deepLink)}`);
    } catch (e) {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={loading}
      title="Войти через Telegram"
      className="h-11 w-11 md:h-10 md:w-10 p-0 flex items-center justify-center rounded-md border border-border bg-secondary/40 text-primary transition-colors hover:bg-secondary/60 disabled:opacity-60"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    </Button>
  );
}
