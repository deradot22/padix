import { LogIn, UserPlus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "title": { ru: "Нужно войти в аккаунт", en: "Sign in required" },
  "text": {
    ru: "Похоже, вы не авторизованы. Войдите в аккаунт или зарегистрируйтесь — это займёт минуту.",
    en: "Looks like you're not signed in. Log in or create an account — it takes a minute.",
  },
  "login": { ru: "Войти", en: "Sign in" },
  "register": { ru: "Зарегистрироваться", en: "Sign up" },
} satisfies Dict;

/**
 * Заглушка для страниц, которые API отдал с 401. Вместо технического
 * «Не удалось загрузить: Unauthorized» объясняем причину и предлагаем вход
 * или регистрацию. Текущий адрес уезжает в ?next=, чтобы после авторизации
 * вернуть пользователя туда, куда он шёл.
 */
export function AuthRequiredCard(props: { description?: string; className?: string }) {
  const { t } = useI18n(TR);
  const nav = useNavigate();
  const location = useLocation();
  const next = encodeURIComponent(`${location.pathname}${location.search}`);

  return (
    <Card className={props.className ?? "border-border/50"}>
      <CardContent className="p-6">
        <div className="text-lg font-semibold">{t("title")}</div>
        <div className="mt-2 text-sm text-muted-foreground">{props.description ?? t("text")}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => nav(`/login?next=${next}`)}>
            <LogIn className="mr-2 h-4 w-4" />
            {t("login")}
          </Button>
          <Button variant="outline" onClick={() => nav(`/register?next=${next}`)}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t("register")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
