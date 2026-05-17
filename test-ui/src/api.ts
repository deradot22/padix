export const API_BASE = (import.meta.env.VITE_API_BASE ?? "/api") as string;

export class ApiError extends Error {
  constructor(public status: number, public body: string, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, text, `${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ---------- Auth ----------

export interface AuthResponse {
  token: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  gender?: "M" | "F" | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface MeResponse {
  email: string;
  playerId: string;
  name: string;
  rating: number;
  ntrp: string;
  gamesPlayed: number;
  publicId: string;
  surveyCompleted: boolean;
  surveyLevel: number | null;
  calibrationMatchesRemaining: number;
  avatarUrl?: string | null;
  gender?: "M" | "F" | null;
}

export const auth = {
  register: (req: RegisterRequest) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(req) }),
  login: (req: LoginRequest) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(req) }),
  me: (token: string) => request<MeResponse>("/me", { token }),
};

// ---------- Survey ----------

export interface SurveyOption {
  id: string;
  label: string;
}

export interface SurveyQuestion {
  id: string;
  title: string;
  options: SurveyOption[];
}

export interface SurveyLevelCard {
  id: string;
  title: string;
  level: number;
  bullets: string[];
}

export interface SurveyDefinition {
  id: string;
  version: number;
  levelCards: SurveyLevelCard[];
  questions: SurveyQuestion[];
}

export interface SurveySubmitRequest {
  version: number;
  baseLevelCardId?: string;
  answers: Record<string, string>;
}

export const survey = {
  current: () => request<SurveyDefinition>("/survey/current"),
  submit: (token: string, req: SurveySubmitRequest) =>
    request<MeResponse>("/survey/submit", {
      method: "POST",
      token,
      body: JSON.stringify(req),
    }),
};

// ---------- Events ----------

export interface CreateEventRequest {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  format?: "AMERICANA";
  pairingMode?: "ROUND_ROBIN" | "BALANCED";
  courtsCount?: number;
  courtNames?: string[] | null;
  autoRounds?: boolean;
  roundsPlanned?: number;
  scoringMode?: "POINTS" | "SETS";
  pointsPerPlayerPerMatch?: number;
  setsPerMatch?: number;
  gamesPerSet?: number;
  tiebreakEnabled?: boolean;
}

export interface EventResponse {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  registeredCount: number;
  courtsCount: number;
  format: string;
  pairingMode: string;
  scoringMode: string;
  pointsPerPlayerPerMatch: number;
}

export const events = {
  create: (token: string, req: CreateEventRequest) =>
    request<EventResponse>("/events", { method: "POST", token, body: JSON.stringify(req) }),
  registerPlayer: (token: string, eventId: string, playerId: string) =>
    request<void>(`/events/${eventId}/register`, {
      method: "POST",
      token,
      body: JSON.stringify({ playerId }),
    }),
  today: (token: string) => request<EventResponse[]>("/events/today", { token }),
  upcoming: (token: string) => request<EventResponse[]>("/events/upcoming", { token }),
};
