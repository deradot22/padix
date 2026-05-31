import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, EventInviteItem, FriendsSnapshot, hasToken, MeResponse, setToken } from "../lib/api";
import { RatingNotificationModal } from "@/components/rating-notification-modal";
import { V0HomePage } from "./v0/pages/V0HomePage";
import { V0GamesPage } from "./v0/pages/V0GamesPage";
import { V0EventPage } from "./v0/pages/V0EventPage";
import { V0CreateEventPage } from "./v0/pages/V0CreateEventPage";
import { V0ProfilePage } from "./v0/pages/V0ProfilePage";
import { V0SettingsPage } from "./v0/pages/V0SettingsPage";
import { V0RatingPage } from "./v0/pages/V0RatingPage";
import { V0LoginPage } from "./v0/pages/V0LoginPage";
import { V0RegisterPage } from "./v0/pages/V0RegisterPage";
import { V0SurveyPage } from "./v0/pages/V0SurveyPage";
import { V0AdminPage } from "./v0/pages/V0AdminPage";
import { V0AdminFeedbackPage } from "./v0/pages/V0AdminFeedbackPage";
import { V0FeedbackPage } from "./v0/pages/V0FeedbackPage";
import { V0LandingPage } from "./v0/pages/V0LandingPage";
import { V0VerifyEmailPage } from "./v0/pages/V0VerifyEmailPage";
import { V0OAuthCallbackPage } from "./v0/pages/V0OAuthCallbackPage";
import { V0TelegramCallbackPage } from "./v0/pages/V0TelegramCallbackPage";
import { V0TelegramBotLoginPage } from "./v0/pages/V0TelegramBotLoginPage";
import { MainLayout } from "@/components/main-layout";

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [surveyResult, setSurveyResult] = useState<null | { rating: number; remaining: number }>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [invites, setInvites] = useState<EventInviteItem[]>([]);
  const [incomingFriends, setIncomingFriends] = useState<FriendsSnapshot["incoming"]>([]);
  const [ratingNotification, setRatingNotification] = useState<{
    id: string;
    newRating: number;
    delta: number;
    eventId: string;
  } | null>(null);

  const authed = !!me;

  useEffect(() => {
    if (!hasToken()) {
      setMe(null);
      setMeLoaded(true);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((m) => {
        if (!cancelled) setMe(m);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setMeLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Listener для popup-based OAuth (Telegram-popup): когда popup-окно ставит padix_token
  // в localStorage, storage-event срабатывает в этом (parent) окне → подтягиваем me и редиректим.
  useEffect(() => {
    const onStorage = async (e: StorageEvent) => {
      if (e.key !== "padix_token") return;
      if (!e.newValue) {
        // Logout в другой вкладке → сбрасываем тут
        setMe(null);
        return;
      }
      try {
        const m = await api.me();
        setMe(m);
        // Если popup залогинил на /login странице — увезём в приложение.
        if (location.pathname === "/login" || location.pathname === "/register") {
          navigate(m.surveyCompleted ? "/" : "/survey", { replace: true });
        }
      } catch {
        /* ignore — токен мог быть невалидным */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [location.pathname, navigate]);

  async function refreshNotifications() {
    if (!me) {
      setNotificationCount(0);
      setInvites([]);
      setIncomingFriends([]);
      return;
    }
    try {
      const [invites, friends] = await Promise.all([api.getInvites(), api.getFriends()]);
      const incoming = friends.incoming?.length ?? 0;
      setInvites(invites ?? []);
      setIncomingFriends(friends.incoming ?? []);
      setNotificationCount((invites?.length ?? 0) + incoming);
    } catch {
      setNotificationCount(0);
    }
  }

  useEffect(() => {
    refreshNotifications();
  }, [me, location.pathname]);

  // Плашка «У вас новый рейтинг» — только когда успешно залогинены
  useEffect(() => {
    if (!me?.playerId || !meLoaded || !hasToken()) return;
    let cancelled = false;
    api
      .getRatingNotification()
      .then((n) => {
        if (!cancelled && n) setRatingNotification(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [me?.playerId, meLoaded]);

  async function resendVerificationEmail() {
    await api.resendVerification();
  }

  // После успешной верификации обновляем me чтобы баннер пропал.
  async function refreshMeAfterVerify() {
    if (!hasToken()) return;
    try {
      const m = await api.me();
      setMe(m);
    } catch {
      // ignore — токен мог быть невалиден, баннер просто не пропадёт
    }
  }

  async function closeRatingNotification() {
    if (!ratingNotification) return;
    try {
      await api.markRatingNotificationSeen(ratingNotification.id);
      const updated = await api.me();
      setMe(updated);
    } catch {
      // ignore
    }
    setRatingNotification(null);
  }

  // Hard gate: если вошёл, но не прошёл тест — отправляем на /survey и прячем остальной сайт.
  // /verify-email и /auth/oauth-callback пропускаем — иначе юзер с email-ссылкой или OAuth-callback'ом
  // улетал бы на /survey до того как мы успели обработать токен.
  useEffect(() => {
    const exempt = location.pathname === "/survey"
      || location.pathname === "/verify-email"
      || location.pathname === "/auth/oauth-callback"
      || location.pathname === "/auth/telegram-callback"
      || location.pathname === "/auth/telegram-login";
    if (me && !me.surveyCompleted && !exempt) {
      navigate("/survey", { replace: true });
    }
  }, [location.pathname, me, navigate]);

  if (!meLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Загрузка…</div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        {/* обратная совместимость: старый префикс */}
        <Route path="/v0/*" element={<Navigate to="/" replace />} />

        {/* Landing page без header для неавторизованных */}
        {!authed && <Route index element={<V0LandingPage />} />}

        {/* Layout с header для всех */}
        <Route
          element={
            <MainLayout
              authed={authed}
              notificationCount={notificationCount}
              onRefreshNotifications={refreshNotifications}
              emailVerified={me?.emailVerified}
              email={me?.email}
              onResendVerification={resendVerificationEmail}
              onLogout={() => {
                setToken(null);
                setMe(null);
                navigate("/rating");
              }}
            >
              <Outlet />
            </MainLayout>
          }
        >
          {authed && <Route index element={<V0HomePage me={me} />} />}
          <Route path="rating" element={<V0RatingPage authed={authed} me={me} />} />
          <Route path="login" element={<V0LoginPage onAuth={(m) => setMe(m)} />} />
          <Route path="register" element={<V0RegisterPage onAuth={(m) => setMe(m)} />} />
          <Route path="survey" element={<V0SurveyPage me={me} onDone={(m) => setMe(m)} onResult={(r) => setSurveyResult(r)} />} />

          <Route path="games" element={<V0GamesPage me={me} />} />
          <Route path="create" element={<V0CreateEventPage me={me} meLoaded={meLoaded} />} />
          <Route path="profile" element={<V0ProfilePage me={me} meLoaded={meLoaded} onMeUpdate={setMe} />} />
          <Route path="settings" element={<V0SettingsPage me={me} meLoaded={meLoaded} onMeUpdate={setMe} />} />
          <Route path="events/:eventId" element={<V0EventPage me={me} meLoaded={meLoaded} />} />
          <Route path="feedback" element={<V0FeedbackPage me={me} meLoaded={meLoaded} />} />
          <Route path="verify-email" element={<V0VerifyEmailPage authed={authed} onVerified={refreshMeAfterVerify} />} />
          <Route path="auth/oauth-callback" element={<V0OAuthCallbackPage onAuth={(m) => setMe(m)} />} />
          <Route path="auth/telegram-callback" element={<V0TelegramCallbackPage onAuth={(m) => setMe(m)} />} />
          <Route path="auth/telegram-login" element={<V0TelegramBotLoginPage onAuth={(m) => setMe(m)} />} />
          <Route path="admin" element={<V0AdminPage />} />
          <Route path="admin/feedback" element={<V0AdminFeedbackPage />} />
        </Route>
      </Routes>

      {surveyResult ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Опрос пройден!</div>
              <button
                type="button"
                className="h-9 rounded-md border border-border bg-transparent px-3 text-sm font-medium hover:bg-secondary transition-colors"
                onClick={() => setSurveyResult(null)}
              >
                Закрыть
              </button>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              Опрос пройден! Теперь нужно сыграть <b>{surveyResult.remaining}</b> калибровочных{" "}
              {surveyResult.remaining === 1 ? "игру" : surveyResult.remaining < 5 ? "игры" : "игр"}, чтобы определить ваш рейтинг.
            </div>
            <div className="mt-5 flex gap-2">
              <button
                className="h-11 flex-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                type="button"
                onClick={() => {
                  setSurveyResult(null);
                  navigate("/profile");
                }}
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ratingNotification ? (
        <RatingNotificationModal
          newRating={ratingNotification.newRating}
          delta={ratingNotification.delta}
          onClose={closeRatingNotification}
        />
      ) : null}
    </>
  );
}

