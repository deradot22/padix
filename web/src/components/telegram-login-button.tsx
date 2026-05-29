import { useEffect, useRef } from "react";
import { TelegramAuthPayload } from "@/lib/api";

declare global {
  interface Window {
    // Telegram-виджет вызывает глобальную функцию по имени из data-onauth.
    // Мы используем уникальное имя на инстанс компонента чтобы избежать конфликтов.
    [key: string]: any;
  }
}

/**
 * Кнопка «Войти через Telegram» в стиле сайта.
 *
 * Telegram Login Widget рендерит свой собственный синий iframe с надписью «Log in with Telegram»
 * и кастомизировать его нельзя. Поэтому используем тот же приём что для Google:
 *  - Рендерим виджет невидимым (opacity 0) поверх своей квадратной иконки-кнопки.
 *  - Visual — наша кнопка с лого Telegram в брендовых цветах.
 *  - Клик идёт через прозрачный iframe Telegram → честный user-gesture, виджет открывает OAuth.
 *
 * Требования к боту:
 *   - В BotFather: /setdomain — тот домен где открыт сайт (для localhost тоже нужно установить).
 *   - Bot token остаётся на сервере, фронту достаточно знать @username бота.
 *
 * Спека: https://core.telegram.org/widgets/login
 */
export function TelegramLoginButton(props: {
  botUsername: string;
  onAuth: (payload: TelegramAuthPayload) => void;
  size?: "small" | "medium" | "large";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Уникальное имя callback'а для этого инстанса (на случай если кнопка отрендерена дважды).
  const callbackNameRef = useRef(`onTelegramAuth_${Math.random().toString(36).slice(2)}`);
  // Держим актуальный onAuth в ref — useEffect не пересоздаёт виджет при смене handler'а.
  const onAuthRef = useRef(props.onAuth);
  useEffect(() => {
    onAuthRef.current = props.onAuth;
  }, [props.onAuth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Регистрируем глобальный callback. Виджет ожидает функцию по точному имени из data-onauth.
    const callbackName = callbackNameRef.current;
    window[callbackName] = (user: TelegramAuthPayload) => {
      onAuthRef.current(user);
    };

    // Создаём script — виджет сам отрисует кнопку в месте где script.
    // size=large — iframe ~210x40, удобно перекрывает квадратную кнопку 40x40.
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", props.botUsername);
    script.setAttribute("data-size", props.size ?? "large");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-userpic", "false");
    container.appendChild(script);

    return () => {
      // Cleanup: убираем скрипт и iframe который виджет создал, плюс глобальный callback.
      while (container.firstChild) container.removeChild(container.firstChild);
      delete window[callbackName];
    };
  }, [props.botUsername, props.size]);

  return (
    <div
      className="relative inline-block h-10 w-10 overflow-hidden rounded-md"
      title="Войти через Telegram"
    >
      {/* Наша иконка-кнопка — в стиле сайта, с лого Telegram в фирменном цвете. */}
      <div className="absolute inset-0 flex items-center justify-center border border-border bg-secondary/40 rounded-md text-primary pointer-events-none select-none transition-colors hover:bg-secondary/60" aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      </div>
      {/* Прозрачный контейнер с виджетом Telegram. Iframe виджета (~210x40) перекрывает нашу кнопку
          и ловит клики. overflow-hidden у родителя скрывает выступающие края iframe. */}
      <div
        ref={containerRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 flex items-center justify-center"
        aria-label="Войти через Telegram"
      />
    </div>
  );
}
