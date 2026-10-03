import { useSyncExternalStore } from "react";
import * as Schema from "effect/Schema";

export interface StudioSession {
  token: string;
  email: string;
  admin: boolean;
}

const STORAGE_KEY = "klawva_studio_session";
const listeners = new Set<() => void>();

const storedSession = Schema.Struct({
  token: Schema.String,
  email: Schema.String,
  admin: Schema.optionalKey(Schema.Boolean),
});

function readStored(): StudioSession | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(storedSession))(raw);
  if (parsed._tag === "None") {
    return null;
  }
  return {
    token: parsed.value.token,
    email: parsed.value.email,
    admin: parsed.value.admin === true,
  };
}

let current: StudioSession | null = readStored();

const notify = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const getStudioSession = (): StudioSession | null => current;

export const subscribeStudioSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setStudioSession = (session: StudioSession): void => {
  current = session;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    current = session;
  }
  notify();
};

export const clearStudioSession = (): void => {
  current = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    current = null;
  }
  notify();
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === STORAGE_KEY) {
      current = readStored();
      notify();
    }
  });
}

export function useStudioSession(): StudioSession | null {
  return useSyncExternalStore(
    subscribeStudioSession,
    getStudioSession,
    () => null,
  );
}
