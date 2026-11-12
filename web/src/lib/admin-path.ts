/**
 * Адрес админки. Не `/admin`, чтобы форму входа нельзя было найти перебором очевидных путей.
 * Переопределяется на сборке через `VITE_ADMIN_PATH` (без слэшей), например в Cloudflare Pages.
 * Сам по себе секретный путь — не защита, а маскировка: защищают пароль, второй фактор и лимит попыток на API.
 */
const fromEnv = (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim().replace(/^\/+|\/+$/g, "");

export const ADMIN_PATH = fromEnv || "ops-k7m2x9";

/** Абсолютный путь внутри админки: adminUrl() → "/ops-k7m2x9", adminUrl("feedback") → "/ops-k7m2x9/feedback". */
export function adminUrl(sub?: string): string {
  return sub ? `/${ADMIN_PATH}/${sub}` : `/${ADMIN_PATH}`;
}
