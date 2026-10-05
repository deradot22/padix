import { cn } from "@/lib/utils";
import { countryName, isCountryCode } from "@/lib/countries";
import { useLang } from "@/lib/i18n";

/**
 * Флаг страны игрока. Картинкой, а не эмодзи: Windows эмодзи-флаги не рисует и показывает
 * вместо них две буквы. Без кода или с неизвестным кодом не рендерит ничего.
 */
export function CountryFlag(props: { code?: string | null; className?: string }) {
  const { lang } = useLang();
  if (!isCountryCode(props.code)) return null;
  const name = countryName(props.code, lang);
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn("fi shrink-0 rounded-[2px] ring-1 ring-black/10 dark:ring-white/15", "fi-" + props.code.toLowerCase(), props.className)}
    />
  );
}
