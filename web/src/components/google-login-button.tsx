import { useEffect, useRef } from "react";

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
 * Кнопка «Войти через Google». Использует Google Identity Services — современный преемник gapi.auth2.
 * Внешний вид кнопки кастомизируется параметрами темы, но это всё равно фирменная Google-кнопка.
 *
 * Спека: https://developers.google.com/identity/gsi/web/guides/overview
 *
 * Требования:
 *  - В Google Cloud Console → Credentials создаётся OAuth 2.0 Client ID (Web application).
 *  - Authorized JavaScript origins: тот origin откуда открыт сайт (для dev — http://localhost:8083).
 *  - Authorized redirect URIs — не нужны (Google Identity Services работает через postMessage).
 */
export function GoogleLoginButton(props: {
  clientId: string;
  onAuth: (idToken: string) => void;
  /** "signin_with" / "signup_with" / "continue_with" — текст на кнопке. */
  text?: GoogleButtonOptions["text"];
  size?: GoogleButtonOptions["size"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(props.onAuth);
  useEffect(() => {
    onAuthRef.current = props.onAuth;
  }, [props.onAuth]);

  useEffect(() => {
    const container = containerRef.current;
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
      g.accounts.id.renderButton(container, {
        theme: "outline",
        size: props.size ?? "large",
        text: props.text ?? "signin_with",
        shape: "rectangular",
        type: "standard",
        locale: "ru",
      });
    };

    if (window.google?.accounts?.id) {
      initButton();
    } else {
      // Скрипт может уже грузиться (другой компонент), не вставляем повторно.
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
      // Содержимое контейнера убираем — Google viget оставляет iframe, который мог бы дублироваться при ремаунте.
      if (container) {
        while (container.firstChild) container.removeChild(container.firstChild);
      }
    };
  }, [props.clientId, props.size, props.text]);

  return <div ref={containerRef} className="flex items-center justify-center" />;
}
