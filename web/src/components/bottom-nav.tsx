import { NavLink } from "react-router-dom";
import { TrendingUp, Gamepad2, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { name: "Рейтинг", href: "/rating", icon: TrendingUp },
  { name: "Игры", href: "/games", icon: Gamepad2 },
  { name: "Создать", href: "/create", icon: Plus },
  { name: "Профиль", href: "/profile", icon: User },
];

/**
 * Мобильная нижняя навигация. Только на <768px (md:hidden).
 * Десктоп пользуется верхней навигацией в шапке.
 */
export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Основная навигация"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
