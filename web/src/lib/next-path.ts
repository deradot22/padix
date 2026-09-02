/**
 * Куда вернуть пользователя после входа/регистрации.
 *
 * Читаем ?next= из query. Пропускаем только относительные пути внутри приложения
 * («/events/123»): всё остальное — протокол-относительные «//evil.com» и абсолютные
 * URL — отбрасываем, иначе получился бы open redirect.
 */
export function nextPath(search: string, fallback = "/"): string {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get("next");
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
