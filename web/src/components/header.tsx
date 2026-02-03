"use client";

import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Check, Moon, Sun, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { api, EventInviteItem, FriendRequestItem } from "@/lib/api";

const navigation = [
  { name: "Рейтинг", href: "/rating" },
  { name: "Игры", href: "/games" },
  { name: "Создать игру", href: "/create" },
  { name: "Профиль", href: "/profile" },
];

export function Header(props: {
  authed: boolean;
  notificationCount: number;
  onRefreshNotifications: () => void | Promise<void>;
  onLogout: () => void;
}) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [isDark, setIsDark] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [invites, setInvites] = useState<EventInviteItem[]>([]);
  const [incomingFriends, setIncomingFriends] = useState<FriendRequestItem[]>([]);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const totalNotifications = useMemo(
    () => (props.notificationCount > 0 ? props.notificationCount : invites.length + incomingFriends.length),
    [incomingFriends.length, invites.length, props.notificationCount],
  );

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
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (bellRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setNotificationsOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-foreground">padix</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navigation.map((item) => (
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
              className="relative"
              onClick={() => setNotificationsOpen((v) => !v)}
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

            {notificationsOpen ? (
              <div
                ref={panelRef}
                className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-4 shadow-xl"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Уведомления</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                    disabled={loadingNotifications}
                    onClick={async () => {
                      await loadNotifications();
                      await props.onRefreshNotifications();
                    }}
                  >
                    Обновить
                  </Button>
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

                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase">Приглашения в игры</div>
                      {loadingNotifications ? (
                        <div className="text-sm text-muted-foreground">Загрузка…</div>
                      ) : invites.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Нет приглашений.</div>
                      ) : (
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
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase">Заявки в друзья</div>
                      {loadingNotifications ? (
                        <div className="text-sm text-muted-foreground">Загрузка…</div>
                      ) : incomingFriends.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Нет входящих заявок.</div>
                      ) : (
                        <div className="space-y-2">
                          {incomingFriends.map((req) => {
                            const key = `friend:${req.publicId}`;
                            return (
                              <div
                                key={req.publicId}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{req.name}</div>
                                  <div className="text-xs text-muted-foreground">{req.publicId}</div>
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
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center rounded-full border border-border bg-secondary p-1">
            <button
              onClick={() => toggleTheme(false)}
              className={cn("rounded-full p-1.5 transition-colors", !isDark ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
              aria-label="Светлая тема"
              title="Светлая тема"
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              onClick={() => toggleTheme(true)}
              className={cn("rounded-full p-1.5 transition-colors", isDark ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
              aria-label="Тёмная тема"
              title="Тёмная тема"
            >
              <Moon className="h-4 w-4" />
            </button>
          </div>

          {props.authed ? (
            <Button variant="outline" size="sm" className="ml-2 bg-transparent" onClick={props.onLogout}>
              Выйти
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="ml-2 bg-transparent" onClick={() => nav("/login")}>
              Войти
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

