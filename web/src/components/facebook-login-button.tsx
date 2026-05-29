import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options?: { scope?: string; return_scopes?: boolean },
      ) => void;
      getLoginStatus: (callback: (response: FacebookLoginResponse) => void) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type FacebookLoginResponse = {
  status: "connected" | "not_authorized" | "unknown";
  authResponse?: {
    accessToken: string;
    expiresIn: number;
    userID: string;
  };
};

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

/**
 * Кастомная кнопка «Войти через Facebook». Использует FB JS SDK.
 * FB не позволяет рендерить полностью свою кнопку через готовый компонент (как Google),
 * поэтому делаем свою стилизованную с фирменным синим цветом.
 *
 * Требования:
 *   - В Facebook Developer Console → Settings → Basic → App Domains: ваш домен (padix.club).
 *   - Privacy Policy URL — обязателен для активации Facebook Login.
 *   - Permissions: public_profile, email (стандартные, не требуют ревью).
 */
export function FacebookLoginButton(props: {
  appId: string;
  onAuth: (accessToken: string) => void;
  text?: string;
}) {
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    // Скрипт уже мог загрузить другой компонент.
    if (window.FB) {
      setSdkReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    const handleLoad = () => {
      // FB.init безопасно вызывать несколько раз с тем же appId.
      window.FB?.init({ appId: props.appId, version: "v18.0", cookie: false, xfbml: false });
      setSdkReady(true);
    };
    if (existing) {
      existing.addEventListener("load", handleLoad, { once: true });
      // Если скрипт уже загрузился — onload не сработает; проверим вручную через таймер.
      const t = window.setTimeout(() => {
        if (window.FB) handleLoad();
      }, 50);
      return () => window.clearTimeout(t);
    } else {
      const script = document.createElement("script");
      script.src = SDK_SRC;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.onload = handleLoad;
      document.head.appendChild(script);
    }
  }, [props.appId]);

  const handleClick = () => {
    if (!window.FB) return;
    window.FB.login(
      (response) => {
        if (response.status === "connected" && response.authResponse?.accessToken) {
          props.onAuth(response.authResponse.accessToken);
        }
      },
      { scope: "public_profile,email" },
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!sdkReady}
      title={props.text ?? "Войти через Facebook"}
      className="h-10 w-10 flex items-center justify-center rounded-md border border-border bg-secondary/40 text-[#1877F2] transition-colors hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    </button>
  );
}
