import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
          prompt: () => void;
        };
      };
    };
  }
}

type GoogleButtonOptions = {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  type?: "standard" | "icon";
  width?: number;
  locale?: string;
};

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/**
 * Кастомная кнопка «Войти через Google» в стиле сайта.
 *
 * Технически GSI требует чтобы клик шёл по их iframe (анти-фрод), но рендер кнопки
 * у них фиксированного дизайна. Стандартный паттерн для кастомного вида:
 *  - Рендерим фирменную Google-кнопку, делаем её прозрачной и накладываем поверх нашей.
 *  - Пользователь видит нашу красивую кнопку, клик попадает в Google-iframe.
 *  - GSI получает «настоящий» user-gesture клик — анти-фрод спокойно.
 *
 * Спека: https://developers.google.com/identity/gsi/web/guides/overview
 */
export function GoogleLoginButton(props: {
  clientId: string;
  onAuth: (idToken: string) => void;
  /** "signin_with" / "signup_with" / "continue_with" — определяет текст на нашей кнопке. */
  text?: GoogleButtonOptions["text"];
  size?: GoogleButtonOptions["size"];
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(props.onAuth);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    onAuthRef.current = props.onAuth;
  }, [props.onAuth]);

  useEffect(() => {
    const container = overlayRef.current;
    if (!container) return;
    let cancelled = false;

    const initButton = () => {
      const g = window.google;
      if (cancelled || !g) return;
      g.accounts.id.initialize({
        client_id: props.clientId,
        callback: (resp) => {
          if (resp?.credential) onAuthRef.current(resp.credential);
        },
      });
      // Рендерим стандартную Google-кнопку в icon-режиме — она будет прозрачно поверх нашей квадратной.
      g.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        type: "icon",
        shape: "square",
      });
      setReady(true);
    };

    if (window.google?.accounts?.id) {
      initButton();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", initButton, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = GSI_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = initButton;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (container) {
        while (container.firstChild) container.removeChild(container.firstChild);
      }
    };
  }, [props.clientId, props.text]);

  const ariaLabel =
    props.text === "signup_with"
      ? "Зарегистрироваться через Google"
      : props.text === "continue_with"
        ? "Продолжить с Google"
        : "Войти через Google";

  return (
    <div className="relative inline-block" title={ariaLabel}>
      {/* Наша квадратная кнопка-иконка — в стиле сайта, с буквой «G» в брендовом зелёном. */}
      <div
        className="h-10 w-10 flex items-center justify-center rounded-md border border-border bg-secondary/40 text-primary text-lg font-bold pointer-events-none select-none transition-colors hover:bg-secondary/60"
        aria-hidden="true"
      >
        {ready ? "G" : "…"}
      </div>
      {/* Прозрачный overlay с реальной GSI-кнопкой. Получает клики через pointer-events. */}
      <div
        ref={overlayRef}
        className="absolute inset-0 opacity-0"
        style={{ colorScheme: "light" }}
        aria-label={ariaLabel}
      />
    </div>
  );
}
