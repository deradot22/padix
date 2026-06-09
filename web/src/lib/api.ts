import { API_BASE_URL } from "./env";

export type EventFormat = "AMERICANA";
export type PairingMode = "ROUND_ROBIN" | "BALANCED";
export type EventStatus = "DRAFT" | "OPEN_FOR_REGISTRATION" | "REGISTRATION_CLOSED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";
export type ScoringMode = "SETS" | "POINTS";

export type Player = {
  id: string;
  name: string;
  rating: number;
  ntrp?: string;
  gamesPlayed: number;
  calibrationEventsRemaining?: number | null;
  publicId?: string;
  avatarUrl?: string | null;
};

export type EventVisibility = "PRIVATE" | "PUBLIC";

export type Event = {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd
  startTime: string; // HH:mm:ss or HH:mm
  endTime: string; // HH:mm:ss or HH:mm
  format: EventFormat;
  pairingMode: PairingMode;
  status: EventStatus;
  registeredCount: number;
  courtsCount: number;
  roundsPlanned: number;
  scoringMode: ScoringMode;
  pointsPerPlayerPerMatch: number;
  setsPerMatch: number;
  gamesPerSet: number;
  tiebreakEnabled: boolean;
  visibility: EventVisibility;
  seriesId?: string | null;
  seriesTitle?: string | null;
};

export type EventSeries = {
  id: string;
  title: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  timezone: string;
  courtsCount: number;
  pairingMode: PairingMode;
  scoringMode: ScoringMode;
  pointsPerPlayerPerMatch: number;
  visibility: EventVisibility;
  materializeHoursBefore: number;
  materializeAtTime: string;   // "HH:mm" — час локального времени автора, когда летит анонс
  /** Режим: HOURS_BEFORE (за N часов до игры) или WEEKLY_SUNDAY ("в конце недели" = воскресенье). */
  materializeMode: "HOURS_BEFORE" | "WEEKLY_SUNDAY";
  /** Per-series override напоминания. null → берём из глобальных Telegram-настроек. */
  reminderHours?: number | null;
  /** Per-series override закрепления анонса. null → берём из глобальных Telegram-настроек. */
  pinAnnouncement?: boolean | null;
  /** Список UUID telegram_chat для анонсов. Пустой → анонс летит во все группы автора. */
  targetChatIds: string[];
  active: boolean;
  lastMaterializedFor?: string | null;
};

export type PointsScore = { teamAPoints: number; teamBPoints: number };
export type SetScore = { teamAGames: number; teamBGames: number };

export type Match = {
  id: string;
  courtNumber: number;
  courtName?: string | null;
  teamA: Player[];
  teamB: Player[];
  status: string;
  score?: {
    mode: ScoringMode;
    points?: PointsScore;
    sets?: SetScore[];
  } | null;
  /** UUID юзера, который ввёл итоговый счёт. null — счёт ещё не введён или историческая запись. */
  submittedByUserId?: string | null;
  /** Имя того, кто ввёл счёт. Для UI-метки «Введён: X». */
  submittedByName?: string | null;
  /** Шанс победы команды A (0..1). null — матч уже сыгран. teamB = 1 - expectedA. */
  expectedA?: number | null;
};

export type Round = {
  id: string;
  roundNumber: number;
  matches: Match[];
};

export type EventDetails = {
  event: Event;
  rounds: Round[];
  registeredPlayers: Player[];
  pendingCancelRequests: Player[];
  isAuthor: boolean;
  authorName: string;
  /** true — PRIVATE-игра и текущий юзер не имеет доступа. rounds/players приходят пустыми. */
  accessRestricted?: boolean;
};

export type BalanceSeverity = "NONE" | "SMALL" | "MEDIUM" | "LARGE";

export type BalancePreview = {
  playerCount: number;
  capacity: number;
  ratingSpread: number;
  severity: BalanceSeverity;
  maxGoodRounds: number;
  requestedRounds: number | null;
  currentPairingMode: PairingMode;
  shouldWarn: boolean;
};

/** Краткая инфа об игроке для виджетов-списков. */
export type PlayerShort = {
  id: string;
  name: string;
  rating: number;
  avatarUrl?: string | null;
};

/** Лучший напарник игрока: агрегированная статистика совместных игр. */
export type TopPartner = {
  player: PlayerShort;
  gamesTogether: number;
  winsTogether: number;
  /** Доля побед 0..1. */
  winRate: number;
  /** Ранжирующий скор — баланс качества и наигранности (сортировка на бэке идёт по нему). */
  score: number;
};

export type AuthProvidersInfo = {
  telegram: boolean;
  google: boolean;
  facebook: boolean;
  twitter: boolean;
};

export type MeResponse = {
  /** Email юзера. null — у OAuth-only юзеров (например, зарегались только через Telegram). */
  email: string | null;
  playerId: string;
  name: string;
  rating: number;
  ntrp: string;
  gamesPlayed: number;
  publicId: string;
  surveyCompleted: boolean;
  surveyLevel: number | null;
  calibrationEventsRemaining: number;
  calibrationMatchesRemaining: number;
  avatarUrl?: string | null;
  gender?: string | null;
  /** Показывать шансы выигрыша в модале «Раунды». По умолчанию false. */
  showWinProbability: boolean;
  /** true — email подтверждён по ссылке из письма. */
  emailVerified: boolean;
  /** true — у юзера задан пароль (можно входить email+password). */
  hasPassword: boolean;
  /** Какие OAuth-провайдеры привязаны. */
  authProviders: AuthProvidersInfo;
};

/** Публичный конфиг авторизации — какие OAuth-провайдеры доступны на сервере. */
export type AuthConfig = {
  /** @username бота для Telegram Login. null — кнопка не показывается. */
  telegramBotUsername: string | null;
  /** Числовой ID бота (для redirect-flow на oauth.telegram.org). null — Telegram-логин выключен. */
  telegramBotId: number | null;
  /** Google OAuth2 Client ID. null — кнопка не показывается. */
  googleClientId: string | null;
  /** Facebook App ID. null — кнопка не показывается. */
  facebookAppId: string | null;
  /** Twitter/X OAuth2 Client ID. null — кнопка не показывается. */
  twitterClientId: string | null;
};

/** Payload от Telegram Login Widget (snake_case как присылает виджет). */
export type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

/** Категории тикетов обратной связи. */
export type FeedbackCategory = "BUG" | "FEATURE" | "QUESTION" | "OTHER";

export type FeedbackTicket = {
  id: string;
  userId: string;
  authorName: string;
  category: FeedbackCategory;
  message: string;
  /** data URL вложения (image/* или video/*). null — без вложения. */
  attachmentDataUrl?: string | null;
  attachmentMime?: string | null;
  attachmentSizeBytes?: number | null;
  createdAt: string;
};

export type ApiError = {
  status: number;
  error: string;
  message: string;
  path?: string | null;
};

export type EventHistoryItem = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  participants?: string[];
  matchesCount: number;
  totalPoints: number | null;
  ratingDelta: number;
};

export type MatchPlayerInfo = { name: string; avatarUrl?: string | null };

export type EventHistoryMatch = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  roundNumber: number;
  matchId: string;
  courtNumber: number;
  scoringMode: string;
  score?: string | null;
  status: string;
  ratingDelta: number | null;
  teamText: string;
  opponentText: string;
  result: string;
  isTeamA: boolean;
  teamPlayers?: MatchPlayerInfo[];
  opponentPlayers?: MatchPlayerInfo[];
};

export type FriendItem = {
  userId: string;
  publicId: string;
  name: string;
  rating: number;
  ntrp?: string;
  gamesPlayed: number;
  calibrationEventsRemaining: number;
  avatarUrl?: string | null;
};

export type FriendRequestItem = {
  publicId: string;
  name: string;
  avatarUrl?: string | null;
};

export type AdminUser = {
  userId: string;
  /** null — у OAuth-only юзеров без привязанного email. */
  email: string | null;
  publicId: string;
  name: string;
  rating: number;
  ntrp: string;
  gamesPlayed: number;
  surveyCompleted: boolean;
  disabled: boolean;
  /** Получает TG-уведомления о новых тикетах обратной связи. */
  isFeedbackAdmin: boolean;
};

export type FriendsSnapshot = {
  friends: FriendItem[];
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
};

export type EventInviteItem = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  fromName: string;
  fromPublicId: string;
};

export type InviteStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type TelegramChatType = "PRIVATE" | "GROUP" | "SUPERGROUP" | "CHANNEL";

export type TelegramChat = {
  id: string;
  chatType: TelegramChatType;
  title: string;
  linkedAt?: string | null;
  notifyUpdated: boolean;
  notifyFinished: boolean;
  notifyReminder: boolean;
};

export type TelegramSettings = {
  enabled: boolean;
  reminderHours: number;
  quietHoursStart: string | null;  // "HH:mm" или null
  quietHoursEnd: string | null;
  timezone: string;
  /** Закреплять анонс новой игры в группах (с silent notification). */
  pinAnnouncement: boolean;
};

export type TelegramLinkToken = {
  token: string;
  botUsername: string;
  deeplink: string;
  linkCommand: string;
  expiresAt: string;
};

export type TelegramStatus = {
  enabled: boolean;
  botUsername: string;
};

export type EventInviteStatusItem = {
  publicId: string;
  name: string;
  status: InviteStatus;
};

function getToken(): string | null {
  const t = localStorage.getItem("padix_token");
  return t?.trim() || null;
}

function getAdminToken(): string | null {
  return localStorage.getItem("padix_admin_token");
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem("padix_token");
  else localStorage.setItem("padix_token", token);
}

export function hasToken(): boolean {
  return !!getToken();
}

export function setAdminToken(token: string | null) {
  if (!token) localStorage.removeItem("padix_admin_token");
  else localStorage.setItem("padix_admin_token", token);
}

export function adminToken() {
  return getAdminToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: unknown = null;
    let textBody: string | null = null;
    try {
      body = await res.json();
    } catch {
      try {
        textBody = await res.text();
      } catch {
        // ignore
      }
    }
    const apiErr = body as Partial<ApiError> | null;
    const msg =
      apiErr?.message ??
      (textBody && textBody.trim() ? textBody.trim() : `HTTP ${res.status} ${res.statusText} while calling ${path}`);
    if (res.status === 401) {
      // Session is no longer valid: clear stale token and force re-auth UX.
      setToken(null);
      if (
        msg === "Session expired" ||
        msg === "Token signature invalid" ||
        msg === "Token malformed" ||
        msg === "Token unsupported" ||
        msg === "Invalid token"
      ) {
        throw new Error("Сессия недействительна или истекла. Войдите снова.");
      }
    }
    throw new Error(msg);
  }

  // 204 / empty
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error("Admin token missing");
  return request<T>(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export const api = {
  getUpcomingEvents: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request<Event[]>(`/api/events/upcoming${qs ? `?${qs}` : ""}`);
  },
  getRating: () => request<Player[]>("/api/players/rating"),
  getEventDetails: (eventId: string) => request<EventDetails>(`/api/events/${eventId}`),
  registerForEvent: (eventId: string, playerId: string) =>
    request(`/api/events/${eventId}/register`, {
      method: "POST",
      body: JSON.stringify({ playerId }),
    }),
  closeRegistration: (eventId: string) =>
    request(`/api/events/${eventId}/close-registration`, { method: "POST" }),
  getBalancePreview: (eventId: string) =>
    request<BalancePreview>(`/api/events/${eventId}/balance-preview`),
  updatePairingMode: (eventId: string, pairingMode: PairingMode) =>
    request<Event>(`/api/events/${eventId}/pairing-mode`, {
      method: "PATCH",
      body: JSON.stringify({ pairingMode }),
    }),
  startEvent: (eventId: string) =>
    request(`/api/events/${eventId}/start`, { method: "POST" }),
  cancelRegistration: (eventId: string) =>
    request<{ status: string; message: string }>(`/api/events/${eventId}/cancel`, { method: "POST" }),
  approveCancel: (eventId: string, playerId: string) =>
    request(`/api/events/${eventId}/cancel/${playerId}/approve`, { method: "POST" }),
  removePlayerFromEvent: (eventId: string, playerId: string) =>
    request(`/api/events/${eventId}/remove/${playerId}`, { method: "POST" }),
  submitScore: (matchId: string, points: { teamAPoints: number; teamBPoints: number }) =>
    request(`/api/events/matches/${matchId}/score`, {
      method: "POST",
      body: JSON.stringify({ points }),
    }),
  saveDraftScore: (matchId: string, points: { teamAPoints: number; teamBPoints: number }) =>
    request(`/api/events/matches/${matchId}/draft-score`, {
      method: "POST",
      body: JSON.stringify(points),
    }),
  finishEvent: (eventId: string) =>
    request(`/api/events/${eventId}/finish`, { method: "POST" }),
  addRound: (eventId: string) =>
    request(`/api/events/${eventId}/rounds/add`, { method: "POST" }),
  addFinalRound: (eventId: string) =>
    request(`/api/events/${eventId}/rounds/final`, { method: "POST" }),
  deleteRound: (eventId: string, roundId: string) =>
    request(`/api/events/${eventId}/rounds/${roundId}`, { method: "DELETE" }),
  deleteEvent: (eventId: string) =>
    request(`/api/events/${eventId}`, { method: "DELETE" }),
  updateEvent: (
    eventId: string,
    payload: {
      title?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      pointsPerPlayerPerMatch?: number;
      courtsCount?: number;
      pairingMode?: PairingMode;
      visibility?: EventVisibility;
    },
  ) =>
    request<Event>(`/api/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createEvent: (payload: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    format: "AMERICANA";
    pairingMode: PairingMode;
    courtsCount: number;
    courtNames?: string[];
    autoRounds: boolean;
    roundsPlanned?: number;
    scoringMode: "POINTS" | "SETS";
    pointsPerPlayerPerMatch?: number;
    telegramChatIds?: string[];
    visibility?: EventVisibility;
  }) =>
    request<Event>("/api/events", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---------- Event series ----------
  listEventSeries: () => request<EventSeries[]>("/api/event-series"),
  getEventSeries: (id: string) => request<EventSeries>(`/api/event-series/${id}`),
  createEventSeries: (payload: {
    title: string;
    daysOfWeek: string;            // "MON,WED,FRI"
    startTime: string;
    endTime: string;
    timezone?: string;
    courtsCount?: number;
    pairingMode?: PairingMode;
    scoringMode?: "POINTS" | "SETS";
    pointsPerPlayerPerMatch?: number;
    visibility?: EventVisibility;
    materializeHoursBefore?: number;
    materializeAtTime?: string;
    materializeMode?: "HOURS_BEFORE" | "WEEKLY_SUNDAY";
    reminderHours?: number | null;
    pinAnnouncement?: boolean | null;
    targetChatIds?: string[];
  }) =>
    request<EventSeries>("/api/event-series", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEventSeries: (
    id: string,
    payload: Partial<EventSeries> & {
      /** Сбросить per-series pin override (использовать глобальное). */
      clearPinAnnouncement?: boolean;
      /** Сбросить per-series reminderHours override (использовать глобальное). */
      clearReminderHours?: boolean;
    }
  ) =>
    request<EventSeries>(`/api/event-series/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  pauseEventSeries: (id: string) =>
    request<EventSeries>(`/api/event-series/${id}/pause`, { method: "POST" }),
  resumeEventSeries: (id: string) =>
    request<EventSeries>(`/api/event-series/${id}/resume`, { method: "POST" }),
  deleteEventSeries: (id: string) =>
    request(`/api/event-series/${id}`, { method: "DELETE" }),

  // ---------- Telegram integration ----------
  getTelegramStatus: () => request<TelegramStatus>("/api/telegram/status"),
  getTelegramChats: () => request<TelegramChat[]>("/api/telegram/chats"),
  createTelegramLinkToken: () =>
    request<TelegramLinkToken>("/api/telegram/link-token", { method: "POST" }),
  unlinkTelegramChat: (chatId: string) =>
    request(`/api/telegram/chats/${chatId}`, { method: "DELETE" }),
  getTelegramSettings: () => request<TelegramSettings>("/api/telegram/settings"),
  updateTelegramSettings: (payload: {
    enabled?: boolean;
    reminderHours?: number;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    quietHoursDisabled?: boolean;
    timezone?: string;
    pinAnnouncement?: boolean;
  }) =>
    request<TelegramSettings>("/api/telegram/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateTelegramChatPreferences: (
    chatId: string,
    payload: { notifyUpdated?: boolean; notifyFinished?: boolean; notifyReminder?: boolean }
  ) =>
    request<TelegramChat>(`/api/telegram/chats/${chatId}/preferences`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  register: (email: string, password: string, name: string, gender?: string) =>
    request<{ token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name, gender: gender || null }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<MeResponse>("/api/me"),
  /** Подтвердить email по токену из ссылки в письме (публичный эндпойнт). */
  verifyEmail: (token: string) =>
    request<void>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  /** Запросить повторную отправку письма верификации (требует авторизации). */
  resendVerification: () =>
    request<void>("/api/me/resend-verification", { method: "POST" }),
  /** Публичный конфиг — какие OAuth-провайдеры включены на сервере. */
  authConfig: () => request<AuthConfig>("/api/auth/config"),
  /** Логин/регистрация через Telegram Login Widget. Возвращает JWT. */
  loginViaTelegram: (payload: TelegramAuthPayload) =>
    request<{ token: string }>("/api/auth/telegram", { method: "POST", body: JSON.stringify(payload) }),
  /** Логин/регистрация через Google Sign-In. Принимает ID-токен (credential от GIS). */
  loginViaGoogle: (idToken: string) =>
    request<{ token: string }>("/api/auth/google", { method: "POST", body: JSON.stringify({ idToken }) }),
  /** Логин/регистрация через Facebook Login. Принимает user access_token. */
  loginViaFacebook: (accessToken: string) =>
    request<{ token: string }>("/api/auth/facebook", { method: "POST", body: JSON.stringify({ accessToken }) }),

  // Telegram login через бота — современный flow без OAuth-формы с телефоном.
  // Фронт зовёт start → получает {token, deepLink} → открывает deepLink → поллит status →
  // когда APPROVED шлёт complete с опц. полями и получает JWT.
  /** Создать одноразовый токен, получить deep-link на бота. */
  telegramBotLoginStart: () =>
    request<{ token: string; deepLink: string; botUsername: string }>(
      "/api/auth/telegram/bot-login/start",
      { method: "POST" },
    ),
  /** Поллить статус: PENDING → AWAITING_APPROVAL → APPROVED / REJECTED / EXPIRED. */
  telegramBotLoginStatus: (token: string) =>
    request<{
      status: "PENDING" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXPIRED";
      telegramName: string | null;
      telegramUsername: string | null;
      photoUrl: string | null;
      existingUser: boolean | null;
    }>(`/api/auth/telegram/bot-login/status?token=${encodeURIComponent(token)}`),
  /**
   * Обменять APPROVED-токен на JWT (создаёт юзера если нового).
   * Если email совпал с существующим аккаунтом — возвращает {awaitingEmailConfirm: {emailSentTo}}
   * вместо token, на email юзера ушло письмо с confirm-link.
   */
  telegramBotLoginComplete: (token: string, name?: string | null, email?: string | null) =>
    request<{ token: string | null; awaitingEmailConfirm: { emailSentTo: string } | null }>(
      "/api/auth/telegram/bot-login/complete",
      {
        method: "POST",
        body: JSON.stringify({ token, name: name || null, email: email || null }),
      },
    ),
  /** Подтвердить привязку Telegram по сырому confirm-токену из URL письма. */
  telegramBotLoginConfirmLink: (confirm: string) =>
    request<{ token: string }>("/api/auth/telegram/bot-login/confirm-link", {
      method: "POST",
      body: JSON.stringify({ confirm }),
    }),
  /**
   * bot-link flow для УЖЕ-залогиненного юзера, который хочет привязать Telegram.
   * Отличается от bot-login: токен помечается link_target_user_id, complete не
   * создаёт нового юзера а линкует TG к currentUserId.
   */
  telegramBotLinkStart: () =>
    request<{ token: string; deepLink: string; botUsername: string }>(
      "/api/auth/telegram/bot-link/start",
      { method: "POST" },
    ),
  telegramBotLinkComplete: (token: string) =>
    request<MeResponse>("/api/auth/telegram/bot-link/complete", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  /**
   * URL для старта Twitter OAuth — браузер должен сделать window.location.href = это.
   * Бэк 302-редиректит на x.com/authorize, потом вернётся на /auth/oauth-callback#token=...
   */
  twitterAuthStartUrl: () => `${API_BASE_URL}/api/auth/twitter/start`,
  /** Привязать Google к текущему юзеру. Принимает ID-токен от GIS. */
  linkGoogle: (idToken: string) =>
    request<MeResponse>("/api/me/auth/google/link", { method: "POST", body: JSON.stringify({ idToken }) }),
  /** Привязать Facebook к текущему юзеру. Принимает access_token от FB SDK. */
  linkFacebook: (accessToken: string) =>
    request<MeResponse>("/api/me/auth/facebook/link", { method: "POST", body: JSON.stringify({ accessToken }) }),
  /** Привязать Telegram к текущему юзеру. */
  linkTelegram: (payload: TelegramAuthPayload) =>
    request<MeResponse>("/api/me/auth/telegram/link", { method: "POST", body: JSON.stringify(payload) }),
  /** Получить URL для редиректа на Twitter (linkUserId уже зашит в state на бэке). */
  linkTwitterStart: () =>
    request<{ url: string }>("/api/me/auth/twitter/link/start", { method: "POST" }),
  /** Отвязать провайдера. */
  unlinkProvider: (provider: "telegram" | "google" | "facebook" | "twitter") =>
    request<MeResponse>(`/api/me/auth/${provider}`, { method: "DELETE" }),
  /**
   * Установить или сменить пароль. Если у юзера уже есть пароль — currentPassword обязателен.
   * Для OAuth-only юзеров — можно опустить (первая установка).
   */
  setPassword: (newPassword: string, currentPassword?: string | null) =>
    request<MeResponse>("/api/me/auth/password", {
      method: "POST",
      body: JSON.stringify({ newPassword, currentPassword: currentPassword || null }),
    }),
  updateAvatar: (avatarDataUrl: string | null) =>
    request<MeResponse>("/api/me/avatar", { method: "PATCH", body: JSON.stringify({ avatarDataUrl }) }),
  updateProfile: (payload: { name?: string; email?: string; password?: string; gender?: string; showWinProbability?: boolean }) =>
    request<MeResponse>("/api/me/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  getFriends: () => request<FriendsSnapshot>("/api/friends"),
  requestFriend: (publicId: string) =>
    request("/api/friends/request", { method: "POST", body: JSON.stringify({ publicId }) }),
  acceptFriend: (publicId: string) =>
    request("/api/friends/accept", { method: "POST", body: JSON.stringify({ publicId }) }),
  declineFriend: (publicId: string) =>
    request("/api/friends/decline", { method: "POST", body: JSON.stringify({ publicId }) }),
  inviteFriendToEvent: (eventId: string, publicId: string) =>
    request(`/api/events/${eventId}/invite`, { method: "POST", body: JSON.stringify({ publicId }) }),
  addFriendToEvent: (eventId: string, publicId: string) =>
    request(`/api/events/${eventId}/add-friend`, { method: "POST", body: JSON.stringify({ publicId }) }),
  getInvites: () => request<EventInviteItem[]>("/api/invites"),
  acceptEventInvite: (eventId: string) =>
    request(`/api/events/${eventId}/invites/accept`, { method: "POST" }),
  declineEventInvite: (eventId: string) =>
    request(`/api/events/${eventId}/invites/decline`, { method: "POST" }),
  getEventInvites: (eventId: string) =>
    request<EventInviteStatusItem[]>(`/api/events/${eventId}/invites`),
  getSurvey: () =>
    request<{
      id: string;
      version: number;
      levelCards: { id: string; title: string; level: number; bullets: string[] }[];
      questions: { id: string; title: string; options: { id: string; label: string }[] }[];
    }>("/api/survey/current"),
  submitSurvey: (payload: { version: number; answers: Record<string, string> }) =>
    request("/api/survey/submit", { method: "POST", body: JSON.stringify(payload) }),
  topPartners: (playerId: string, limit = 3) =>
    request<TopPartner[]>(`/api/players/${playerId}/top-partners?limit=${limit}`),
  myHistory: () => request<EventHistoryItem[]>("/api/me/history"),
  myHistoryEvent: (eventId: string) =>
    request<EventHistoryMatch[]>(`/api/me/history/${eventId}`),
  getRatingHistory: () =>
    request<{ date: string; rating: number; delta: number | null; eventId: string | null }[]>("/api/me/rating-history"),
  getRatingNotification: () =>
    request<{ id: string; newRating: number; delta: number; eventId: string } | null>("/api/me/rating-notification"),
  markRatingNotificationSeen: (id: string) =>
    request(`/api/me/rating-notification/${id}/seen`, { method: "POST" }),

  // ---------- Feedback (тикеты обратной связи) ----------
  submitFeedback: (payload: { category: FeedbackCategory; message: string; attachmentDataUrl?: string | null }) =>
    request<FeedbackTicket>("/api/feedback", { method: "POST", body: JSON.stringify(payload) }),
  getMyFeedback: () => request<FeedbackTicket[]>("/api/feedback/mine"),
  adminListFeedback: () => adminRequest<FeedbackTicket[]>("/api/admin/feedback"),
  adminDeleteFeedback: (id: string) =>
    adminRequest<void>(`/api/admin/feedback/${id}`, { method: "DELETE" }),

  adminLogin: (username: string, password: string) =>
    request<{ token: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  adminListUsers: () => adminRequest<AdminUser[]>("/api/admin/users"),
  adminUpdateUser: (userId: string, payload: { email?: string; name?: string; password?: string; disabled?: boolean; isFeedbackAdmin?: boolean }) =>
    adminRequest<AdminUser>(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteUser: (userId: string) => adminRequest<AdminUser>(`/api/admin/users/${userId}`, { method: "DELETE" }),
  adminRestoreUser: (userId: string, payload: { email: string; password: string; name?: string }) =>
    adminRequest<AdminUser>(`/api/admin/users/${userId}/restore`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminCreateUser: (payload: {
    email: string;
    password: string;
    name: string;
    publicId?: number | null;
    rating?: number | null;
    ntrp?: string | null;
    gamesPlayed?: number | null;
    surveyCompleted?: boolean | null;
    disabled?: boolean | null;
    calibrationEventsRemaining?: number | null;
  }) =>
    adminRequest<AdminUser>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

