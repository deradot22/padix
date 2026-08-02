import { getCurrentLang } from "@/lib/i18n";

export function cn(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

const MONTHS: Record<"ru" | "en", string[]> = {
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export function formatEventDate(dateStr: string): string {
  const lang = getCurrentLang();
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateStr;
  const month = MONTHS[lang][m - 1] ?? "";
  return lang === "en" ? `${month} ${d}` : `${d} ${month}`;
}

export function timeRange(startTime?: string, endTime?: string): string {
  const start = startTime?.slice(0, 5) ?? "—";
  const end = endTime?.slice(0, 5);
  return end ? `${start}–${end}` : start;
}

