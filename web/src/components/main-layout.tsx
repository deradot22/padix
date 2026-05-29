import React from "react";
import { useLocation } from "react-router-dom";
import { Header } from "@/components/header";
import { EmailVerificationBanner } from "@/components/email-verification-banner";

export function MainLayout(props: {
  children: React.ReactNode;
  authed: boolean;
  notificationCount: number;
  onRefreshNotifications: () => void | Promise<void>;
  onLogout: () => void;
  /** Если authed=true и emailVerified=false — показываем баннер сверху. */
  emailVerified?: boolean;
  /** Email юзера для отображения в баннере. null/undefined — баннер не показывается. */
  email?: string | null;
  /** Колбэк для повторной отправки письма верификации. */
  onResendVerification?: () => Promise<void>;
}) {
  const { pathname } = useLocation();
  // На странице /verify-email сам сценарий — подтверждение, баннер избыточен.
  const showBanner =
    props.authed &&
    props.emailVerified === false &&
    props.email &&
    props.onResendVerification &&
    pathname !== "/verify-email";

  return (
    <div className="min-h-dvh bg-background">
      {showBanner ? (
        <EmailVerificationBanner email={props.email!} onResend={props.onResendVerification!} />
      ) : null}
      <Header
        authed={props.authed}
        notificationCount={props.notificationCount}
        onRefreshNotifications={props.onRefreshNotifications}
        onLogout={props.onLogout}
      />
      <main className="mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">{props.children}</main>
    </div>
  );
}
