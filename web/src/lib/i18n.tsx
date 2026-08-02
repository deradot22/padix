import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Лёгкая i18n без сторонних библиотек: два языка (ru/en).
 * — Дефолт: язык устройства (navigator.language, ru* → ru, иначе en).
 * — Выбор пользователя хранится в localStorage("padix_lang") и переживает перезагрузку.
 * — Словари модульные: каждая страница держит свой Dict и берёт t через useI18n(dict).
 */
export type Lang = "ru" | "en";
export type Dict = Record<string, { ru: string; en: string }>;

const STORAGE_KEY = "padix_lang";

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "en") return stored;
    const device = navigator.language ?? "";
    return device.toLowerCase().startsWith("ru") ? "ru" : "en";
  } catch {
    return "ru";
  }
}

// Модульная копия для не-React кода (форматтеры дат и т.п.). Обновляется провайдером;
// компоненты при смене языка всё равно перерендериваются через контекст.
let currentLang: Lang = detectLang();

export function getCurrentLang(): Lang {
  return currentLang;
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: currentLang,
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* приватный режим — просто не сохраняем */
    }
  }, []);

  currentLang = lang;
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/**
 * t по словарю модуля. Интерполяция: "Привет, {name}" + vars {name: "Вася"}.
 * Неизвестный ключ возвращается как есть — заметно в UI и не роняет рендер.
 */
export function useI18n<D extends Dict>(dict: D) {
  const { lang } = useLang();
  const t = useCallback(
    (key: keyof D & string, vars?: Record<string, string | number>) => {
      const entry = dict[key];
      let s = entry ? entry[lang] : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      }
      return s;
    },
    [dict, lang],
  );
  return { t, lang };
}

/**
 * Форма слова при числе: ru — [1, 2–4, 5+] («игрок», «игрока», «игроков»),
 * en — [единственное, множественное].
 */
export function plural(lang: Lang, n: number, ru: [string, string, string], en: [string, string]): string {
  if (lang === "en") return Math.abs(n) === 1 ? en[0] : en[1];
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return ru[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return ru[1];
  return ru[2];
}
