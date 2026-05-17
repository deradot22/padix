import { useSyncExternalStore } from "react";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  gender: "M" | "F";
  surveyLevelCardId: string;
  token: string;
  playerId: string;
  surveyCompleted: boolean;
  createdAt: number;
}

interface State {
  users: TestUser[];
}

const STORAGE_KEY = "padix-test-ui:v1";

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { users: [] };
    return JSON.parse(raw) as State;
  } catch {
    return { users: [] };
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function emit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

export const store = {
  getState: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  addUser: (user: TestUser) => {
    state = { ...state, users: [...state.users, user] };
    emit();
  },
  removeUser: (id: string) => {
    state = { ...state, users: state.users.filter((u) => u.id !== id) };
    emit();
  },
  clearUsers: () => {
    state = { ...state, users: [] };
    emit();
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
