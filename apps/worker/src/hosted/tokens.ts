import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export const hashToken = (token: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });

const randomToken = (prefix: string): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const body = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${prefix}${body}`;
};

export const issueListingToken = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const token = randomToken("al_");
    const hash = yield* hashToken(token);
    yield* db
      .run(
        "INSERT INTO agent_tokens (id, listing_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
        [crypto.randomUUID(), listingId, hash, new Date().toISOString()],
      )
      .pipe(Effect.orDie);
    return token;
  });

export const listingForToken = (
  db: DatabaseImpl,
  token: string,
): Effect.Effect<string | null> =>
  Effect.gen(function* () {
    const hash = yield* hashToken(token);
    const row = yield* db
      .first(
        "SELECT listing_id AS listingId FROM agent_tokens WHERE token_hash = ? AND revoked_at IS NULL",
        [hash],
      )
      .pipe(Effect.orDie);
    return row === null ? null : String(row.listingId);
  });

export const issueJobToken = (
  db: DatabaseImpl,
  taskId: string,
  expiresAt: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const token = randomToken("jt_");
    const hash = yield* hashToken(token);
    yield* db
      .run(
        "INSERT INTO job_tokens (id, task_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at",
        [crypto.randomUUID(), taskId, hash, expiresAt, new Date().toISOString()],
      )
      .pipe(Effect.orDie);
    return token;
  });

export const taskForJobToken = (
  db: DatabaseImpl,
  token: string,
  now: Date = new Date(),
): Effect.Effect<string | null> =>
  Effect.gen(function* () {
    const hash = yield* hashToken(token);
    const row = yield* db
      .first(
        "SELECT task_id AS taskId, expires_at AS expiresAt FROM job_tokens WHERE token_hash = ?",
        [hash],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      return null;
    }
    if (Date.parse(String(row.expiresAt)) <= now.getTime()) {
      return null;
    }
    return String(row.taskId);
  });

export const jobTokenExpiry = (now: Date = new Date(), hours = 26): string =>
  new Date(now.getTime() + hours * 60 * 60 * 1_000).toISOString();
