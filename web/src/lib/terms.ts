import { api } from "./api";

/**
 * Версия «Условий и Политики конфиденциальности». Поднять, когда документы меняются по существу:
 * сервер хранит последнюю принятую версию (users.terms_version) как доказательство согласия.
 */
export const TERMS_VERSION = 1;

const SHOWN_KEY = "padix_terms_notice_shown";

/** Экран входа/регистрации показал строку «вы принимаете Условия и Политику». */
export function markTermsNoticeShown() {
  try {
    window.sessionStorage.setItem(SHOWN_KEY, String(TERMS_VERSION));
  } catch {
    // sessionStorage недоступен — согласие просто не запишется, вход это не ломает.
  }
}

/**
 * После успешного входа: если человек видел строку о согласии (в том числе до редиректа на
 * Google/Telegram), сообщаем серверу, какую версию он принял. Ошибка не мешает входу.
 */
export async function confirmTermsIfShown() {
  let shown: string | null = null;
  try {
    shown = window.sessionStorage.getItem(SHOWN_KEY);
    window.sessionStorage.removeItem(SHOWN_KEY);
  } catch {
    return;
  }
  if (!shown) return;
  try {
    await api.acceptTerms(Number(shown) || TERMS_VERSION);
  } catch {
    // Не критично: запишется при следующем входе.
  }
}
