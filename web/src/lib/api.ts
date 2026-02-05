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
};

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
  matchesCount: number;
  totalPoints: number | null;
  ratingDelta: number;
};

export type EventHistoryMatch = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
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
};

export type FriendItem = {
  userId: string;
  publicId: string;
  name: string;
  rating: number;
  ntrp?: string;
  gamesPlayed: number;
  calibrationEventsRemaining: number;
};

export type FriendRequestItem = {
  publicId: string;
  name: string;
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

export type EventInviteStatusItem = {
  publicId: string;
  name: string;
  status: InviteStatus;
};

function getToken(): string | null {
  return localStorage.getItem("padelgo_token");
}

function getAdminToken(): string | null {
  return localStorage.getItem("padelgo_admin_token");
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem("padelgo_token");
  else localStorage.setItem("padelgo_token", token);
}

export function setAdminToken(token: string | null) {
  if (!token) localStorage.removeItem("padelgo_admin_token");
  else localStorage.setItem("padelgo_admin_token", token);
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
  finishEvent: (eventId: string) =>
    request(`/api/events/${eventId}/finish`, { method: "POST" }),
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
  }) =>
    request<Event>("/api/events", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  register: (email: string, password: string, name: string) =>
    request<{ token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () =>
    request<{
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
    }>("/api/me"),
  getFriends: () => request<FriendsSnapshot>("/api/friends"),
  requestFriend: (publicId: string) =>
    request("/api/friends/request", { method: "POST", body: JSON.stringify({ publicId }) }),
  acceptFriend: (publicId: string) =>
    request("/api/friends/accept", { method: "POST", body: JSON.stringify({ publicId }) }),
  declineFriend: (publicId: string) =>
    request("/api/friends/decline", { method: "POST", body: JSON.stringify({ publicId }) }),
  inviteFriendToEvent: (eventId: string, publicId: string) =>
    request(`/api/events/${eventId}/invite`, { method: "POST", body: JSON.stringify({ publicId }) }),
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

  adminLogin: (username: string, password: string) =>
    request<{ token: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  adminListUsers: () => adminRequest<AdminUser[]>("/api/admin/users"),
  adminUpdateUser: (userId: string, payload: { email?: string; name?: string; password?: string; disabled?: boolean }) =>
    adminRequest<AdminUser>(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteUser: (userId: string) => adminRequest<AdminUser>(`/api/admin/users/${userId}`, { method: "DELETE" }),
};

