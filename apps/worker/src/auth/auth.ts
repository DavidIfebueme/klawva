import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { backfillSessionsForUser } from "../account/account.ts";
import type { DatabaseImpl } from "../db/database.ts";
import { sendEmail } from "../email/brevo.ts";
import { magicLinkEmail } from "../email/templates.ts";
import type { Env } from "../env.ts";
import { AuthError, signToken, verifyToken } from "./tokens.ts";

const magicLinkTtlSeconds = 15 * 60;
const sessionTtlSeconds = 30 * 24 * 60 * 60;

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const normalize = (email: string): string => email.trim().toLowerCase();

const hashToken = (token: string): Effect.Effect<string, AuthError> =>
  Effect.tryPromise({
    try: async () => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    },
    catch: (cause) => new AuthError({ reason: String(cause) }),
  });

export const isAdmin = (env: Env, email: string): boolean => {
  const allow = env.ADMIN_EMAILS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  if (allow.length === 0) {
    return false;
  }
  return allow.includes(normalize(email));
};

export const upsertUser = (
  db: DatabaseImpl,
  email: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const normalized = normalize(email);
    const existing = yield* db
      .first("SELECT id AS id FROM users WHERE email = ?", [normalized])
      .pipe(Effect.orDie);
    if (existing !== null) {
      return String(existing.id);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [id, normalized, now, now],
      )
      .pipe(Effect.orDie);
    return id;
  });

export const requestMagicLink = (
  env: Env,
  db: DatabaseImpl,
  email: string,
  next: string,
): Effect.Effect<void, AuthError> =>
  Effect.gen(function* () {
    const normalized = normalize(email);
    yield* upsertUser(db, normalized);
    const token = yield* signToken(env.AUTH_SECRET, {
      email: normalized,
      exp: nowSeconds() + magicLinkTtlSeconds,
      scope: "magic_link",
    });
    const safeNext =
      next.startsWith("/") && !next.startsWith("//") ? next : "/studio";
    const link = `${env.FRONTEND_BASE_URL}/studio/auth/verify?token=${token}&next=${encodeURIComponent(safeNext)}`;
    const context = safeNext === "/account" ? "account" : "studio";
    yield* sendEmail({
      apiKey: env.BREVO_API_KEY,
      senderEmail: env.BREVO_SENDER_EMAIL,
      senderName: "Klawva",
      toEmail: normalized,
      subject:
        context === "account"
          ? "Your Klawva account login link"
          : "Your Klawva studio login link",
      html: magicLinkEmail(link, context),
    }).pipe(Effect.orDie);
  });

export interface Identity {
  readonly email: string;
  readonly userId: string;
  readonly admin: boolean;
}

export const verifyMagicLink = (
  env: Env,
  db: DatabaseImpl,
  token: string,
): Effect.Effect<{ sessionToken: string; identity: Identity }, AuthError> =>
  Effect.gen(function* () {
    const payload = yield* verifyToken(env.AUTH_SECRET, token);
    if (payload.scope !== "magic_link") {
      return yield* Effect.fail(new AuthError({ reason: "wrong_scope" }));
    }
    const tokenHash = yield* hashToken(token);
    const alreadyUsed = yield* db
      .first("SELECT token_hash AS tokenHash FROM used_tokens WHERE token_hash = ?", [
        tokenHash,
      ])
      .pipe(Effect.orDie);
    if (alreadyUsed !== null) {
      return yield* Effect.fail(new AuthError({ reason: "token_used" }));
    }
    yield* db
      .run("INSERT INTO used_tokens (token_hash, used_at) VALUES (?, ?)", [
        tokenHash,
        new Date().toISOString(),
      ])
      .pipe(Effect.orDie);
    const userId = yield* upsertUser(db, payload.email);
    yield* backfillSessionsForUser(db, userId, payload.email);
    const sessionToken = yield* signToken(env.AUTH_SECRET, {
      email: payload.email,
      exp: nowSeconds() + sessionTtlSeconds,
      scope: "session",
    });
    return {
      sessionToken,
      identity: {
        email: payload.email,
        userId,
        admin: isAdmin(env, payload.email),
      },
    };
  });

export const identityFromToken = (
  env: Env,
  db: DatabaseImpl,
  token: string,
): Effect.Effect<Identity, AuthError> =>
  Effect.gen(function* () {
    const payload = yield* verifyToken(env.AUTH_SECRET, token);
    if (payload.scope !== "session") {
      return yield* Effect.fail(new AuthError({ reason: "wrong_scope" }));
    }
    const userId = yield* upsertUser(db, payload.email);
    return {
      email: payload.email,
      userId,
      admin: isAdmin(env, payload.email),
    };
  });

export const tokenFromHeaders = (
  headers: Readonly<Record<string, string | undefined>>,
): string | null => {
  const authorization = headers["authorization"];
  if (authorization !== undefined && authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  const direct = headers["x-auth-token"];
  return direct !== undefined && direct.length > 0 ? direct : null;
};

export const RequestEmail = Schema.Struct({
  email: Schema.String,
  next: Schema.optionalKey(Schema.String),
});
export const VerifyToken = Schema.Struct({ token: Schema.String });
