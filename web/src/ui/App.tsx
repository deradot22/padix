import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { UpcomingPage } from "./pages/UpcomingPage";
import { RatingPage } from "./pages/RatingPage";
import { EventPage } from "./pages/EventPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SurveyPage } from "./pages/SurveyPage";
import { ProfilePage } from "./pages/ProfilePage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { useEffect, useState } from "react";
import { api, setToken } from "../lib/api";

type Theme = "light" | "dark";

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("padix_theme");
    return stored === "dark" ? "dark" : "light";
  });
  const [me, setMe] = useState<null | {
    email: string;
    name: string;
    rating: number;
    gamesPlayed: number;
    surveyCompleted: boolean;
    surveyLevel: number | null;
    calibrationEventsRemaining: number;
  }>(null);
  const [surveyResult, setSurveyResult] = useState<null | { rating: number; remaining: number }>(null);

  const authed = !!me;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("padix_theme", theme);
  }, [theme]);

  useEffect(() => {
    api
      .me()
      .then((m) => setMe(m))
      .catch(() => setMe(null));
  }, []);

  // Hard gate: если вошёл, но не прошёл тест — отправляем на /survey и прячем остальной сайт
  useEffect(() => {
    if (me && !me.surveyCompleted && location.pathname !== "/survey") {
      navigate("/survey", { replace: true });
    }
  }, [location.pathname, me, navigate]);

  const inSurveyGate = !!me && !me.surveyCompleted;
  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <>
      <header className="topbar" style={inSurveyGate ? { position: "static" } : undefined}>
        <div className="topbar-inner">
          <div className="brand">
            <span>padix</span>
          </div>
          {inSurveyGate ? (
            <div className="badge">Обязательный тест</div>
          ) : (
            <nav className="nav">
            <NavLink to="/rating" className={({ isActive }) => (isActive ? "active" : undefined)}>
              Рейтинг
            </NavLink>
            {authed ? (
              <>
                <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : undefined)}>
                  Игры
                </NavLink>
                <NavLink to="/create" className={({ isActive }) => (isActive ? "active" : undefined)}>
                  Создать игру
                </NavLink>
                <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : undefined)}>
                  Профиль
                </NavLink>
                <button
                  className="theme-toggle"
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}
                  title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
                >
                  <span className="theme-toggle__icon" aria-hidden="true">☀</span>
                  <span className="theme-toggle__icon" aria-hidden="true">☾</span>
                  <span className={`theme-toggle__thumb ${theme === "dark" ? "is-right" : ""}`} aria-hidden="true" />
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setToken(null);
                    setMe(null);
                    navigate("/rating");
                  }}
                >
                  Выйти
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={({ isActive }) => (isActive ? "active" : undefined)}>
                  Войти
                </NavLink>
                <NavLink to="/register" className={({ isActive }) => (isActive ? "active" : undefined)}>
                  Регистрация
                </NavLink>
                <button
                  className="theme-toggle"
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}
                  title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
                >
                  <span className="theme-toggle__icon" aria-hidden="true">☀</span>
                  <span className="theme-toggle__icon" aria-hidden="true">☾</span>
                  <span className={`theme-toggle__thumb ${theme === "dark" ? "is-right" : ""}`} aria-hidden="true" />
                </button>
              </>
            )}
            </nav>
          )}
        </div>
      </header>

      <main className="container">
        <Routes>
          <Route path="/rating" element={<RatingPage authed={authed} />} />
          <Route path="/login" element={<LoginPage onAuth={(m) => setMe(m)} />} />
          <Route path="/register" element={<RegisterPage onAuth={(m) => setMe(m)} />} />

          {/* Protected */}
          <Route path="/" element={<UpcomingPage requireAuth me={me} />} />
          <Route
            path="/survey"
            element={<SurveyPage me={me} onDone={(m) => setMe(m)} onResult={(r) => setSurveyResult(r)} />}
          />
          <Route path="/create" element={<CreateEventPage me={me} />} />
          <Route path="/profile" element={<ProfilePage me={me} />} />
          <Route path="/events/:eventId" element={<EventPage me={me} />} />
        </Routes>
      </main>

      {surveyResult ? (
        <div className="modal-overlay">
          <div className="modal">
            <div className="stars">
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className="star"
                  style={{
                    left: `${(i * 37) % 100}%`,
                    top: `${(i * 19) % 100}%`,
                    animationDelay: `${(i % 7) * 0.35}s`,
                    animationDuration: `${3.8 + (i % 5) * 0.45}s`,
                  }}
                />
              ))}
            </div>
            <div className="split">
              <h2 style={{ margin: 0 }}>Готово!</h2>
              <span className="pill ok">предварительный рейтинг</span>
            </div>
            <div className="rating-big">{surveyResult.rating}</div>
            <div className="muted">
              Мы ещё калибруем рейтинг: осталось <b>{surveyResult.remaining}</b> калибровочных игр.
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="btn primary"
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
    </>
  );
}

