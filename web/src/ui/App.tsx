import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, EventInviteItem, FriendsSnapshot, hasToken, setToken } from "../lib/api";
import { RatingNotificationModal } from "@/components/rating-notification-modal";
import { V0HomePage } from "./v0/pages/V0HomePage";
import { V0GamesPage } from "./v0/pages/V0GamesPage";
import { V0EventPage } from "./v0/pages/V0EventPage";
import { V0CreateEventPage } from "./v0/pages/V0CreateEventPage";
import { V0ProfilePage } from "./v0/pages/V0ProfilePage";
import { V0RatingPage } from "./v0/pages/V0RatingPage";
import { V0LoginPage } from "./v0/pages/V0LoginPage";
import { V0RegisterPage } from "./v0/pages/V0RegisterPage";
import { V0SurveyPage } from "./v0/pages/V0SurveyPage";
import { V0AdminPage } from "./v0/pages/V0AdminPage";
import { MainLayout } from "@/components/main-layout";

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<null | {
    email: string;
    playerId: string;
    name: string;
    rating: number;
    gamesPlayed: number;
    publicId: string;
    surveyCompleted: boolean;
    surveyLevel: number | null;
    calibrationEventsRemaining: number;
    avatarUrl?: string | null;
  }>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [surveyResult, setSurveyResult] = useState<null | { rating: number; remaining: number }>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [invites, setInvites] = useState<EventInviteItem[]>([]);
  const [incomingFriends, setIncomingFriends] = useState<FriendsSnapshot["incoming"]>([]);
  const [ratingNotification, setRatingNotification] = useState<{
    id: string;
    newRating: number;
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

  // Hard gate: если вошёл, но не прошёл тест — отправляем на /survey и прячем остальной сайт
  useEffect(() => {
    if (me && !me.surveyCompleted && location.pathname !== "/survey") {
      navigate("/survey", { replace: true });
    }
  }, [location.pathname, me, navigate]);

  if (!meLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Загрузка…</div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        {/* обратная совместимость: старый префикс */}
        <Route path="/v0/*" element={<Navigate to="/" replace />} />

        <Route
          element={
            <MainLayout
              authed={authed}
              notificationCount={notificationCount}
              onRefreshNotifications={refreshNotifications}
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
          <Route index element={<V0HomePage me={me} />} />
          <Route path="rating" element={<V0RatingPage authed={authed} me={me} />} />
          <Route path="login" element={<V0LoginPage onAuth={(m) => setMe(m)} />} />
          <Route path="register" element={<V0RegisterPage onAuth={(m) => setMe(m)} />} />
          <Route path="survey" element={<V0SurveyPage me={me} onDone={(m) => setMe(m)} onResult={(r) => setSurveyResult(r)} />} />

          <Route path="games" element={<V0GamesPage me={me} />} />
          <Route path="create" element={<V0CreateEventPage me={me} meLoaded={meLoaded} />} />
          <Route path="profile" element={<V0ProfilePage me={me} meLoaded={meLoaded} onMeUpdate={setMe} />} />
          <Route path="events/:eventId" element={<V0EventPage me={me} meLoaded={meLoaded} />} />
          <Route path="admin" element={<V0AdminPage />} />
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
          onClose={closeRatingNotification}
        />
      ) : null}
    </>
  );
}

