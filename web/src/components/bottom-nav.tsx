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
 *
 * Дизайн «плавающей панели»: вместо приклеенной к краю полосы на bg-card
 * (в тёмной теме oklch 0.16 почти сливалась с фоном 0.12) — приподнятая
 * панель с отступами, на более контрастном surface `bg-secondary`
 * (тёмная: oklch 0.22 против фона 0.12 — заметный отрыв; светлая: 0.94
 * против 0.98 — панель темнее фона), с рамкой и выраженной тенью-elevation.
 * Активный пункт подсвечивается «пилюлей» bg-primary/15 + text-primary +
 * жирная подпись + верхняя точка-индикатор — активность не только цветом.
 */
export function BottomNav() {
  return (
    <nav
      // iOS safe-area: на жестовых iPhone (viewport-fit=cover в index.html)
      // env(safe-area-inset-bottom) поднимает панель над home-indicator / нижней
      // панелью Safari. На устройствах без выреза env()=0 → mb-3 панели остаётся
      // единственным отступом, поведение не меняется. Десктоп: env()=0 + md:hidden.
      className="fixed inset-x-0 bottom-0 z-50 md:hidden [padding-bottom:env(safe-area-inset-bottom)]"
      aria-label="Основная навигация"
    >
      {/* Плавающая панель: отступы от краёв + скругление + контрастный surface
          + рамка + плотная тень (4-уровневый elevation) отделяют её от фона. */}
      <div className="mx-3 mb-3 rounded-2xl border border-border bg-secondary/95 backdrop-blur-xl shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5),0_2px_8px_-2px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
        <div className="mx-auto flex max-w-md items-stretch gap-1 p-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.href}
                to={item.href}
                // NavLink сам проставляет aria-current="page" на активном пункте.
                className={({ isActive }) =>
                  cn(
                    "group relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium",
                    "transition-[background-color,color] duration-200 motion-reduce:transition-none",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary",
                    isActive
                      ? // Активный: заполненная «пилюля» + акцентный цвет + жирная подпись + точка-индикатор сверху.
                        "bg-primary/15 font-semibold text-primary after:absolute after:left-1/2 after:top-1 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-transform duration-200 motion-reduce:transition-none",
                        // Активность подчёркиваем формой (увеличенная + более толстая иконка),
                        // а не только цветом — доступно для дальтоников.
                        isActive ? "scale-110" : "group-hover:scale-105",
                      )}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                    {item.name}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
