import { redirect } from "react-router-dom";
import { ApiError } from "./api-error.ts";
import {
  clearStudioSession,
  getStudioSession,
  type StudioSession,
} from "./studio-session.ts";

export const requireSession = (): StudioSession => {
  const session = getStudioSession();
  if (session === null) {
    throw redirect("/studio/login");
  }
  return session;
};

export const rethrowAuth = (error: unknown): never => {
  if (error instanceof ApiError && error.status === 401) {
    clearStudioSession();
    throw redirect("/studio/login");
  }
  throw error;
};
