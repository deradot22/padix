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
 * Кнопка «Войти через Telegram». Рендерит официальный Telegram Login Widget — это iframe
 * с фирменной синей кнопкой; кастомизировать внешний вид нельзя (политика Telegram).
 *
 * Виджет добавляет на страницу скрипт `<script src="https://telegram.org/js/telegram-widget.js">`
 * и через data-onauth вызывает нашу глобальную функцию с payload юзера.
 *
 * Требования к боту:
 *   - В BotFather: /setdomain → тот домен где открыт сайт (для localhost тоже нужно установить).
 *   - Bot token остаётся на сервере, фронту достаточно знать @username бота.
 *
 * Спека: https://core.telegram.org/widgets/login
 */
export function TelegramLoginButton(props: {
  botUsername: string;
  onAuth: (payload: TelegramAuthPayload) => void;
  size?: "small" | "medium" | "large";
  /** showUserPhoto: показывать аватар юзера на кнопке после логина. По-умолчанию true. */
  showUserPhoto?: boolean;
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
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", props.botUsername);
    script.setAttribute("data-size", props.size ?? "large");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-userpic", String(props.showUserPhoto ?? true));
    container.appendChild(script);

    return () => {
      // Cleanup: убираем скрипт и iframe который виджет создал, плюс глобальный callback.
      while (container.firstChild) container.removeChild(container.firstChild);
      delete window[callbackName];
    };
  }, [props.botUsername, props.size, props.showUserPhoto]);

  return <div ref={containerRef} className="flex items-center justify-center" />;
}
