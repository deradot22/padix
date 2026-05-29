import { api } from "@/lib/api";

/**
 * Кнопка «Войти через X». В отличие от Google/FB/Telegram у Twitter нет встроенного widget'а
 * для SPA — нужно делать полный редирект на их OAuth-страницу, потом callback возвращается
 * на наш бэк, который редиректит обратно на фронт с JWT в URL hash.
 *
 * Соответственно кнопка делает простой `window.location.href = ...` на бэковый endpoint.
 */
export function TwitterLoginButton(props: { text?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = api.twitterAuthStartUrl();
      }}
      title={props.text ?? "Войти через X"}
      className="h-10 w-10 flex items-center justify-center rounded-md border border-border bg-secondary/40 text-foreground transition-colors hover:bg-secondary/60"
    >
      <svg className="h-4 w-4" viewBox="0 0 1200 1227" fill="currentColor" aria-hidden="true">
        <path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" />
      </svg>
    </button>
  );
}
