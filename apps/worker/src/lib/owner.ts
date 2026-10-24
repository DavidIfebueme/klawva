import * as Effect from "effect/Effect";
import { constantTimeEqual } from "./secure.ts";
import { signToken, verifyToken } from "../auth/tokens.ts";

export const COOKIE_NAME = "klawva_owner";
const OWNER_SCOPE = "owner";
const MAX_AGE_SECONDS = 7776000;

export const ownerGateEnabled = (
  ownerOnly: string | undefined,
  ownerKey: string | undefined,
): boolean => ownerOnly === "true" && (ownerKey ?? "").length > 0;

export const isPublicApiPath = (pathname: string): boolean =>
  pathname === "/api/config" ||
  pathname === "/api/listings" ||
  pathname.startsWith("/api/listings/") ||
  pathname === "/api/devices/claim";

export const signatureVerifiedApiPath = (pathname: string): boolean =>
  pathname === "/api/discord/interactions" ||
  pathname === "/api/slack/events";

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

export const ownerSigningSecret = (
  authSecret: string,
  ownerKey: string,
): string => `${authSecret}\u0000owner\u0000${ownerKey}`;

export const ownerTokenIsValid = async (
  authSecret: string,
  ownerKey: string,
  token: string | null,
): Promise<boolean> => {
  if (token === null) {
    return false;
  }
  const exit = await Effect.runPromiseExit(
    verifyToken(ownerSigningSecret(authSecret, ownerKey), token),
  );
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
    signToken(ownerSigningSecret(authSecret, expected), {
      email: "",
      exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
      scope: OWNER_SCOPE,
    }),
  );
  return exit._tag === "Success" ? buildOwnerCookie(exit.value) : null;
};

export const unlockKeyFromRequest = async (
  request: Request,
): Promise<string> => {
  const exit = await Effect.runPromiseExit(
    Effect.tryPromise(() => request.formData()),
  );
  if (exit._tag !== "Success") {
    return "";
  }
  const value = exit.value.get("key");
  return typeof value === "string" ? value : "";
};

export const ownerBlockedResponse = (): Response =>
  Response.json({ error: "private_testing" }, { status: 403 });

const unlockPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Klawva owner</title>
</head>
<body>
<form method="post" action="/owner/unlock">
<label for="key">Owner key</label>
<input id="key" type="password" name="key" autocomplete="off" autofocus>
<button type="submit">Unlock</button>
</form>
</body>
</html>`;

export const ownerUnlockPage = (): Response =>
  new Response(unlockPage, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; form-action 'self'; base-uri 'none'",
    },
  });
