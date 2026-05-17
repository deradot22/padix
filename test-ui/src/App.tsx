import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { UsersPage } from "./pages/UsersPage";
import { GamesPage } from "./pages/GamesPage";
import { AnimationsPage } from "./pages/AnimationsPage";
import { RatingGraphPage } from "./pages/RatingGraphPage";
import { API_BASE } from "./api";

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <h1>padix · test-ui</h1>
        <nav>
          <NavLink to="/users" className={({ isActive }) => (isActive ? "active" : "")}>
            Пользователи
          </NavLink>
          <NavLink to="/games" className={({ isActive }) => (isActive ? "active" : "")}>
            Игры
          </NavLink>
          <NavLink to="/animations" className={({ isActive }) => (isActive ? "active" : "")}>
            Анимации
          </NavLink>
          <NavLink to="/rating-graph" className={({ isActive }) => (isActive ? "active" : "")}>
            График рейтинга
          </NavLink>
        </nav>
        <span className="api-info">API: {API_BASE}</span>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/users" replace />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/animations" element={<AnimationsPage />} />
          <Route path="/rating-graph" element={<RatingGraphPage />} />
        </Routes>
      </main>
    </div>
  );
}
