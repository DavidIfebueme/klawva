import * as Effect from "effect/Effect";
import { constantTimeEqual } from "./secure.ts";
import { signToken, verifyToken } from "../auth/tokens.ts";

export const COOKIE_NAME = "klawva_owner";
const OWNER_SCOPE = "owner";
const MAX_AGE_SECONDS = 7776000;

export const ownerGateEnabled = (
  ownerOnly: string,
  ownerKey: string,
): boolean => ownerOnly === "true" && ownerKey.length > 0;

export const isPublicApiPath = (pathname: string): boolean =>
  pathname === "/health" ||
  pathname === "/api/config" ||
  pathname === "/api/listings" ||
  pathname.startsWith("/api/listings/");

export const parseCookie = (
  header: string | null,
  name: string,
): string | null => {
  if (header === null) {
    return null;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (trimmed.slice(0, separator) === name) {
      return trimmed.slice(separator + 1);
    }
  }
  return null;
};

export const buildOwnerCookie = (token: string): string =>
  `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;

export const clearOwnerCookie = (): string =>
  `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export const ownerTokenIsValid = async (
  secret: string,
  token: string | null,
): Promise<boolean> => {
  if (token === null) {
    return false;
  }
  const exit = await Effect.runPromiseExit(verifyToken(secret, token));
  return exit._tag === "Success" && exit.value.scope === OWNER_SCOPE;
};

export const ownerUnlockCookie = async (
  authSecret: string,
  ownerKey: string | undefined,
  key: string,
): Promise<string | null> => {
  const expected = ownerKey ?? "";
  if (expected.length === 0 || !constantTimeEqual(key, expected)) {
    return null;
  }
  const exit = await Effect.runPromiseExit(
    signToken(authSecret, {
      email: "",
      exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
      scope: OWNER_SCOPE,
    }),
  );
  return exit._tag === "Success" ? buildOwnerCookie(exit.value) : null;
};

export const ownerBlockedResponse = (): Response =>
  Response.json({ error: "private_testing" }, { status: 403 });
