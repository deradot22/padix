export function cn(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

export function formatEventDate(dateStr: string): string {
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateStr;
  return `${d} ${months[m - 1] ?? ""}`;
}

export function timeRange(startTime?: string, endTime?: string): string {
  const start = startTime?.slice(0, 5) ?? "—";
  const end = endTime?.slice(0, 5);
  return end ? `${start}–${end}` : start;
}

