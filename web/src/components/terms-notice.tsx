import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Dict, useI18n } from "@/lib/i18n";
import { markTermsNoticeShown } from "@/lib/terms";

const TR = {
  "before": { ru: "Продолжая, вы принимаете ", en: "By continuing you accept the " },
  "terms": { ru: "Условия использования", en: "Terms & Conditions" },
  "and": { ru: " и ", en: " and the " },
  "privacy": { ru: "Политику конфиденциальности", en: "Privacy Policy" },
} satisfies Dict;

/**
 * Строка согласия под кнопками входа и регистрации (включая Google/Telegram — они тоже создают
 * аккаунт). Показ запоминается, и после входа сервер получает принятую версию документов.
 */
export function TermsNotice(props: { className?: string }) {
  const { t } = useI18n(TR);
  useEffect(() => {
    markTermsNoticeShown();
  }, []);
  return (
    <p className={props.className ?? "text-center text-xs text-muted-foreground"}>
      {t("before")}
      <Link to="/terms" target="_blank" className="text-primary underline underline-offset-2">
        {t("terms")}
      </Link>
      {t("and")}
      <Link to="/privacy" target="_blank" className="text-primary underline underline-offset-2">
        {t("privacy")}
      </Link>
      .
    </p>
  );
}
