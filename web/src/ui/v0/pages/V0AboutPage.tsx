import { Link } from "react-router-dom";
import { ChevronRight, FileText, MessageSquare, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "title": { ru: "О приложении", en: "About" },
  "subtitle": {
    ru: "Padix — игры в падел, рейтинг и поиск партнёров.",
    en: "Padix — padel games, rating and finding partners.",
  },
  "privacy": { ru: "Политика конфиденциальности", en: "Privacy Policy" },
  "terms": { ru: "Условия использования", en: "Terms & Conditions" },
  "feedback": { ru: "Обратная связь", en: "Feedback" },
} satisfies Dict;

/** «О приложении» из меню: документы и связь с командой — как экран About в мобильном приложении. */
export function V0AboutPage() {
  const { t } = useI18n(TR);
  const items = [
    { to: "/privacy", label: t("privacy"), icon: ShieldCheck },
    { to: "/terms", label: t("terms"), icon: FileText },
    { to: "/feedback", label: t("feedback"), icon: MessageSquare },
  ];
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card className="gap-0 py-1">
        <CardContent className="divide-y divide-border p-0">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-secondary/40 transition-colors"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
