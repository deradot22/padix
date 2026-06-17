"use client";

import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Check, Gamepad2, LogOut, Menu, MessageSquare, Moon, Plus, Settings, Sun, TrendingUp, User, UserPlus, X } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { api, EventInviteItem, FriendRequestItem } from "@/lib/api";

import type { LucideIcon } from "lucide-react";

// Десктоп: "Создать игру" не дублируем — есть hero CTA на / и FAB-кнопка на /games.
const desktopNavigation = [
  { name: "Рейтинг", href: "/rating" },
  { name: "Игры", href: "/games" },
  { name: "Профиль", href: "/profile" },
];
// Мобильный drawer: главный хаб навигации с иконками.
// "Создать игру" больше не отдельный пункт — это кнопка "+" рядом с "Игры".
const mobileNavigation: { name: string; href: string; icon: LucideIcon }[] = [
  { name: "Рейтинг", href: "/rating", icon: TrendingUp },
  { name: "Игры", href: "/games", icon: Gamepad2 },
  { name: "Профиль", href: "/profile", icon: User },
];
// Совместимость со старым кодом, который ещё может ссылаться на navigation.
const navigation = mobileNavigation;

export function Header(props: {
  authed: boolean;
  notificationCount: number;
  onRefreshNotifications: () => void | Promise<void>;
  onLogout: () => void;
}) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const confirm = useConfirm();
  const reduceMotion = useReducedMotion();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [invites, setInvites] = useState<EventInviteItem[]>([]);
  const [incomingFriends, setIncomingFriends] = useState<FriendRequestItem[]>([]);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const shouldBeDark = stored === "dark";
    setIsDark(shouldBeDark);
    if (shouldBeDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, []);

  const totalNotifications = useMemo(
    () => (props.notificationCount > 0 ? props.notificationCount : invites.length + incomingFriends.length),
    [incomingFriends.length, invites.length, props.notificationCount],
  );
  const hasInvites = invites.length > 0;
  const hasFriendRequests = incomingFriends.length > 0;

  const toggleTheme = (dark: boolean) => {
    setIsDark(dark);
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  async function loadNotifications() {
    if (!props.authed) {
      setInvites([]);
      setIncomingFriends([]);
      return;
    }
    setLoadingNotifications(true);
    setNotificationsError(null);
    try {
      const [inv, friends] = await Promise.all([api.getInvites(), api.getFriends()]);
      setInvites(inv ?? []);
      setIncomingFriends(friends.incoming ?? []);
    } catch (e: any) {
      setNotificationsError(e?.message ?? "Не удалось загрузить уведомления");
    } finally {
      setLoadingNotifications(false);
    }
  }

  useEffect(() => {
    if (!notificationsOpen) return;
    loadNotifications();
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const id = window.setInterval(() => {
      loadNotifications();
    }, 30000);
    return () => window.clearInterval(id);
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (bellRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setNotificationsOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [notificationsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (settingsBtnRef.current?.contains(target)) return;
      if (settingsPanelRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [settingsOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setSettingsOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-foreground">padix</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {desktopNavigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive || pathname === item.href
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
          <div className="relative">
            <Button
              ref={bellRef}
              variant="ghost"
              size="icon"
              className="relative size-11 md:size-9"
              onClick={(e) => {
                e.stopPropagation();
                setNotificationsOpen((v) => !v);
              }}
              aria-label="Уведомления"
              title="Уведомления"
            >
              <Bell className="h-5 w-5" />
              {totalNotifications > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {totalNotifications}
                </span>
              ) : null}
            </Button>

            <div
              ref={panelRef}
              className={cn(
                // Стекло как у мобильного меню: bg-background/70 + backdrop-blur. scale убран —
                // transform отключает backdrop-filter (blur не работал бы). Анимация — opacity.
                "fixed left-2 right-2 top-16 w-auto rounded-xl border border-border bg-background/70 backdrop-blur-2xl p-4 shadow-2xl z-50 sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:w-[360px] sm:max-w-[calc(100vw-2rem)] transition-opacity duration-150 origin-top opacity-0 pointer-events-none",
                notificationsOpen ? "opacity-100 pointer-events-auto" : "",
              )}
              onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Уведомления</div>
                </div>

                {!props.authed ? (
                  <div className="mt-3 space-y-3">
                    <div className="text-sm text-muted-foreground">Нужно войти, чтобы видеть уведомления.</div>
                    <div className="flex gap-2">
                      <Button onClick={() => nav("/login")}>Войти</Button>
                      <Button variant="outline" onClick={() => nav("/register")}>
                        Регистрация
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-5">
                    <div className="text-xs text-muted-foreground">
                      Инвайтов: <b>{invites.length}</b>, заявок в друзья: <b>{incomingFriends.length}</b>
                    </div>

                    {notificationsError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        {notificationsError}
                      </div>
                    ) : null}

                    {loadingNotifications ? (
                      <div className="text-sm text-muted-foreground">Загрузка…</div>
                    ) : null}

                    {!loadingNotifications && !hasInvites && !hasFriendRequests ? (
                      <div className="text-sm text-muted-foreground">Нет уведомлений.</div>
                    ) : null}

                    {hasInvites ? (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase">Приглашения в игры</div>
                        <div className="space-y-2">
                          {invites.map((inv) => {
                            const key = `invite:${inv.eventId}`;
                            return (
                              <div
                                key={`${inv.eventId}-${inv.fromPublicId}`}
                                className="rounded-xl border border-border bg-secondary/30 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{inv.eventTitle}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {inv.eventDate} • {inv.fromName} ({inv.fromPublicId})
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        setActionKey(key);
                                        try {
                                          await api.acceptEventInvite(inv.eventId);
                                          await loadNotifications();
                                          await props.onRefreshNotifications();
                                        } catch (e: any) {
                                          setNotificationsError(e?.message ?? "Ошибка");
                                        } finally {
                                          setActionKey(null);
                                        }
                                      }}
                                      disabled={actionKey === key}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Принять
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-transparent"
                                      onClick={async () => {
                                        setActionKey(key);
                                        try {
                                          await api.declineEventInvite(inv.eventId);
                                          await loadNotifications();
                                          await props.onRefreshNotifications();
                                        } catch (e: any) {
                                          setNotificationsError(e?.message ?? "Ошибка");
                                        } finally {
                                          setActionKey(null);
                                        }
                                      }}
                                      disabled={actionKey === key}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      setNotificationsOpen(false);
                                      nav(`/events/${inv.eventId}`);
                                    }}
                                  >
                                    Открыть игру
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {hasFriendRequests ? (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase">Заявки в друзья</div>
                        <div className="space-y-2">
                          {incomingFriends.map((req) => {
                            const key = `friend:${req.publicId}`;
                            return (
                              <div
                                key={req.publicId}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="h-9 w-9 shrink-0 rounded-full bg-secondary/60 border border-border overflow-hidden flex items-center justify-center text-sm font-semibold">
                                    {req.avatarUrl ? (
                                      <img src={req.avatarUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      req.name?.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("") || "?"
                                    )}
                                  </div>
                                  <div className="font-medium truncate">{req.name}</div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      setActionKey(key);
                                      try {
                                        await api.acceptFriend(req.publicId);
                                        await loadNotifications();
                                        await props.onRefreshNotifications();
                                      } catch (e: any) {
                                        setNotificationsError(e?.message ?? "Ошибка");
                                      } finally {
                                        setActionKey(null);
                                      }
                                    }}
                                    disabled={actionKey === key}
                                  >
                                    <UserPlus className="h-4 w-4 mr-1" />
                                    Принять
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="bg-transparent"
                                    onClick={async () => {
                                      setActionKey(key);
                                      try {
                                        await api.declineFriend(req.publicId);
                                        await loadNotifications();
                                        await props.onRefreshNotifications();
                                      } catch (e: any) {
                                        setNotificationsError(e?.message ?? "Ошибка");
                                      } finally {
                                        setActionKey(null);
                                      }
                                    }}
                                    disabled={actionKey === key}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
          </div>

          <button
            type="button"
            onClick={() => toggleTheme(!isDark)}
            className="hidden md:flex items-center rounded-full border border-border bg-secondary p-1 cursor-pointer hover:bg-secondary/80 transition-colors min-h-9"
            aria-label={isDark ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            title={isDark ? "Светлая тема" : "Тёмная тема"}
          >
            <span
              className={cn("rounded-full p-2 md:p-1.5 transition-colors flex items-center justify-center", !isDark ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
            >
              <Sun className="h-4 w-4" />
            </span>
            <span
              className={cn("rounded-full p-2 md:p-1.5 transition-colors flex items-center justify-center", isDark ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
            >
              <Moon className="h-4 w-4" />
            </span>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden size-11"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Меню"
            title="Меню"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {props.authed ? (
            <div className="relative ml-2 hidden md:inline-flex">
              <Button
                ref={settingsBtnRef}
                variant="ghost"
                size="icon"
                className="size-11 md:size-9"
                onClick={(e) => {
                  e.stopPropagation();
                  setSettingsOpen((v) => !v);
                }}
                aria-label="Настройки"
                aria-expanded={settingsOpen}
                title="Настройки"
              >
                <Settings className="h-5 w-5" />
              </Button>
              <div
                ref={settingsPanelRef}
                className={cn(
                  "absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card p-1 shadow-xl z-50",
                  settingsOpen ? "block" : "hidden",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    nav("/settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Настройки
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    nav("/feedback");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <MessageSquare className="h-4 w-4" />
                  Обратная связь
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    props.onLogout?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Выйти
                </button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="ml-2 bg-transparent hidden md:inline-flex" onClick={() => nav("/login")}>
              Войти
            </Button>
          )}
        </div>
      </div>

      {createPortal(
      <AnimatePresence>
        {mobileOpen ? (
          <>
            {/* Лёгкое притемнение под стеклом + клик закрывает меню. */}
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed inset-x-0 bottom-0 top-16 z-[90] bg-black/25 md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
          {/*
            Эффект «матового стекла»: полупрозрачный фон + backdrop-blur размывает
            контент под меню. ВАЖНО: анимируем только opacity (без y-сдвига) — transform
            ломает backdrop-filter, из-за чего раньше blur не применялся.
          */}
          <motion.div
            key="mobile-drawer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            className="fixed left-0 right-0 top-16 z-[100] border-b border-border bg-background/70 backdrop-blur-2xl shadow-2xl md:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
              {/* Основная навигация (Рейтинг/Игры/Создать/Профиль) теперь в нижней панели BottomNav.
                 Здесь — только вторичное: Настройки, Обратная связь, тема, выход. */}
              {props.authed && (
                <>
                  <NavLink
                    to="/settings"
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2",
                        isActive || pathname === "/settings"
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                      )
                    }
                  >
                    <Settings className="h-4 w-4" />
                    Настройки
                  </NavLink>
                  <NavLink
                    to="/feedback"
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2",
                        isActive || pathname === "/feedback"
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                      )
                    }
                  >
                    <MessageSquare className="h-4 w-4" />
                    Обратная связь
                  </NavLink>
                </>
              )}
              <div className="my-1 h-px bg-border" />
              {/* Одна строка: слева Выйти/Войти, справа — iOS-свитч темы. */}
              <div className="flex items-center justify-between gap-2">
                {props.authed ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Выйти из аккаунта?",
                          description: "Вы уверены, что хотите выйти?",
                          confirmLabel: "Выйти",
                          cancelLabel: "Отмена",
                          confirmVariant: "destructive",
                        })
                      ) {
                        setMobileOpen(false);
                        props.onLogout?.();
                      }
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Выйти
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); nav("/login"); }}
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                  >
                    Войти
                  </button>
                )}
                {/* Свитч темы справа от кнопки выхода. Меню не закрываем — видно смену темы. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  aria-label={isDark ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
                  title={isDark ? "Светлая тема" : "Тёмная тема"}
                  onClick={() => toggleTheme(!isDark)}
                  className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2"
                >
                  {isDark ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
                  <span
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      isDark ? "bg-primary" : "bg-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
                        isDark ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
          </>
        ) : null}
      </AnimatePresence>,
      document.body
      )}
    </header>
  );
}

