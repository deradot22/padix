import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Moon, Sun } from "lucide-react";
import { cn } from "./utils";

export function V0Header(props: {
  authed: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  notificationCount?: number;
  onLogout?: () => void;
}) {
  const nav = useNavigate();
  const notificationCount = props.notificationCount ?? 0;

  const navigation = [
    { name: "Рейтинг", href: "/rating" },
    { name: "Игры", href: "/games" },
    { name: "Создать игру", href: "/create" },
    { name: "Профиль", href: "/profile" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-foreground">padix</span>
        </NavLink>

        <nav className="hidden items-center gap-1 md:flex">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            onClick={() => nav("/profile")}
            aria-label="Уведомления"
            title="Уведомления"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {notificationCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={props.onToggleTheme}
            className="flex items-center rounded-full border border-border bg-secondary p-1 cursor-pointer hover:bg-secondary/80 transition-colors"
            aria-label={props.theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            title={props.theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            <span
              className={cn(
                "rounded-full p-1.5 transition-colors flex items-center justify-center",
                props.theme !== "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <Sun className="h-4 w-4" />
            </span>
            <span
              className={cn(
                "rounded-full p-1.5 transition-colors flex items-center justify-center",
                props.theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <Moon className="h-4 w-4" />
            </span>
          </button>

          {props.authed ? (
            <button
              type="button"
              className="ml-2 inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              onClick={props.onLogout}
            >
              Выйти
            </button>
          ) : (
            <button
              type="button"
              className="ml-2 inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              onClick={() => nav("/login")}
            >
              Войти
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

