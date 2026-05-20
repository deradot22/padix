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

export type MeResponse = {
  email: string;
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
  email: string;
  publicId: string;
  name: string;
  rating: number;
  ntrp: string;
  gamesPlayed: number;
  surveyCompleted: boolean;
  disabled: boolean;
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
  }) =>
    request<EventSeries>("/api/event-series", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEventSeries: (id: string, payload: Partial<EventSeries>) =>
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
  updateAvatar: (avatarDataUrl: string | null) =>
    request<MeResponse>("/api/me/avatar", { method: "PATCH", body: JSON.stringify({ avatarDataUrl }) }),
  updateProfile: (payload: { name?: string; email?: string; password?: string; gender?: string }) =>
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
  myHistory: () => request<EventHistoryItem[]>("/api/me/history"),
  myHistoryEvent: (eventId: string) =>
    request<EventHistoryMatch[]>(`/api/me/history/${eventId}`),
  getRatingHistory: () =>
    request<{ date: string; rating: number; delta: number | null; eventId: string | null }[]>("/api/me/rating-history"),
  getRatingNotification: () =>
    request<{ id: string; newRating: number; delta: number; eventId: string } | null>("/api/me/rating-notification"),
  markRatingNotificationSeen: (id: string) =>
    request(`/api/me/rating-notification/${id}/seen`, { method: "POST" }),

  adminLogin: (username: string, password: string) =>
    request<{ token: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  adminListUsers: () => adminRequest<AdminUser[]>("/api/admin/users"),
  adminUpdateUser: (userId: string, payload: { email?: string; name?: string; password?: string; disabled?: boolean }) =>
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

