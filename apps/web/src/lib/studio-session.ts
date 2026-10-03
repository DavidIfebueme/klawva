import { useSyncExternalStore } from "react";

export interface StudioSession {
  token: string;
  email: string;
  admin: boolean;
}

const STORAGE_KEY = "klawva_studio_session";
const listeners = new Set<() => void>();

function readStored(): StudioSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).token === "string" &&
      typeof (parsed as Record<string, unknown>).email === "string"
    ) {
      const record = parsed as Record<string, unknown>;
      return {
        token: String(record.token),
        email: String(record.email),
        admin: record.admin === true,
      };
    }
  } catch {
    return null;
  }
  return null;
}

let current: StudioSession | null = readStored();

export const getStudioSession = (): StudioSession | null => current;

export const subscribeStudioSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setStudioSession = (session: StudioSession): void => {
  current = session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  for (const listener of listeners) {
    listener();
  }
};

export const clearStudioSession = (): void => {
  current = null;
  localStorage.removeItem(STORAGE_KEY);
  for (const listener of listeners) {
    listener();
  }
};

export function useStudioSession(): StudioSession | null {
  return useSyncExternalStore(
    subscribeStudioSession,
    getStudioSession,
    () => null,
  );
}
