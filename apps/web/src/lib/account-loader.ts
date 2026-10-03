import { redirect } from "react-router-dom";
import { ApiError } from "./api-error.ts";
import {
  clearStudioSession,
  getStudioSession,
  type StudioSession,
} from "./studio-session.ts";

const loginUrl = "/studio/login?next=/account";

export const requireAccountSession = (): StudioSession => {
  const session = getStudioSession();
  if (session === null) {
    throw redirect(loginUrl);
  }
  return session;
};

export const rethrowAccountAuth = (error: unknown): never => {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    clearStudioSession();
    throw redirect(loginUrl);
  }
  throw error;
};
