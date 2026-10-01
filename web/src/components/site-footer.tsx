import { Link } from "react-router-dom";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "privacy": { ru: "Политика конфиденциальности", en: "Privacy Policy" },
  "terms": { ru: "Условия использования", en: "Terms & Conditions" },
  "feedback": { ru: "Обратная связь", en: "Feedback" },
} satisfies Dict;

/** Padix появился в 2025: «© 2025» в первый год, дальше диапазон «© 2025–<текущий>». */
export function copyright(): string {
  const year = new Date().getFullYear();
  return year > PADIX_SINCE ? `© ${PADIX_SINCE}–${year} Padix` : `© ${PADIX_SINCE} Padix`;
}

const PADIX_SINCE = 2025;

/**
 * Подвал на всех страницах с шапкой: копирайт и постоянные ссылки на политику и условия
 * (GDPR требует, чтобы политика была легко доступна). Не закреплён — виден только в самом
 * конце страницы и не перекрывает ни нижнее меню, ни окна ввода счёта.
 */
export function SiteFooter() {
  const { t } = useI18n(TR);
  const links = [
    { to: "/privacy", label: t("privacy") },
    { to: "/terms", label: t("terms") },
    { to: "/feedback", label: t("feedback") },
  ];
  return (
    <footer className="mt-10 mb-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span>{copyright()}</span>
        {links.map((link) => (
          <Link key={link.to} to={link.to} className="hover:text-foreground transition-colors">
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
