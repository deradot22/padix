import React from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
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
  const prefersReducedMotion = useReducedMotion();
  // На странице /verify-email сам сценарий — подтверждение, баннер избыточен.
  const showBanner =
    props.authed &&
    props.emailVerified === false &&
    props.email &&
    props.onResendVerification &&
    pathname !== "/verify-email";

  // Лёгкий fade при смене страницы. mode="wait" чтобы старая страница ушла до показа новой.
  // При prefers-reduced-motion fallback — мгновенно (duration 0).
  const fade = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.18, ease: "easeOut" as const },
      };

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
      <main className="mx-auto max-w-7xl w-full px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 md:pb-8 lg:px-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pathname} {...fade}>
            {props.children}
          </motion.div>
        </AnimatePresence>
      </main>
      {props.authed ? <BottomNav /> : null}
    </div>
  );
}
