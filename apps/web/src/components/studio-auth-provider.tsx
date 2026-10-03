import React, { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "klawva_studio_session";

interface StudioSession {
  token: string;
  email: string;
  admin: boolean;
}

interface StudioAuthValue {
  session: StudioSession | null;
  login: (token: string, email: string, admin: boolean) => void;
  logout: () => void;
}

const StudioAuthContext = createContext<StudioAuthValue | undefined>(undefined);

function readStoredSession(): StudioSession | null {
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

export function StudioAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StudioSession | null>(readStoredSession);
  const navigate = useNavigate();

  const login = (token: string, email: string, admin: boolean) => {
    const next = { token, email, admin };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    navigate("/studio");
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    navigate("/studio/login");
  };

  return (
    <StudioAuthContext.Provider value={{ session, login, logout }}>
      {children}
    </StudioAuthContext.Provider>
  );
}

export function useStudioAuth(): StudioAuthValue {
  const value = useContext(StudioAuthContext);
  if (value === undefined) {
    throw new Error("useStudioAuth must be used within a StudioAuthProvider");
  }
  return value;
}
