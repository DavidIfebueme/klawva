import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import { closeTransports } from "../session/transports.ts";

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const issueToken = (): Effect.Effect<{ token: string; hash: string }, Error> =>
  Effect.tryPromise({
    try: async () => {
      const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const hash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return { token, hash };
    },
    catch: (cause) => new Error(String(cause)),
  });

export const pairDevice = (
  db: DatabaseImpl,
  userId: string,
  name: string,
): Effect.Effect<{ deviceId: string; token: string }, Error> =>
  Effect.gen(function* () {
    const deviceId = crypto.randomUUID();
    const { token, hash } = yield* issueToken();
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO devices (id, user_id, name, token_hash, previous_token_hash, created_at, rotated_at, revoked_at, last_seen_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, NULL)",
        [deviceId, userId, name, hash, now],
      )
      .pipe(Effect.orDie);
    return { deviceId, token };
  });

export const rotateToken = (
  db: DatabaseImpl,
  deviceId: string,
): Effect.Effect<{ token: string } | null, Error> =>
  Effect.gen(function* () {
    const row = yield* db
      .first("SELECT token_hash AS tokenHash FROM devices WHERE id = ? AND revoked_at IS NULL", [deviceId])
      .pipe(Effect.orDie);
    if (row === null) {
      return null;
    }
    const { token, hash } = yield* issueToken();
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE devices SET previous_token_hash = ?, token_hash = ?, rotated_at = ? WHERE id = ?",
        [String(row.tokenHash), hash, now, deviceId],
      )
      .pipe(Effect.orDie);
    return { token };
  });

export const deviceForToken = (
  db: DatabaseImpl,
  sessionId: string,
  token: string,
): Effect.Effect<string | null, Error> =>
  Effect.gen(function* () {
    const digest = yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      catch: (cause) => new Error(String(cause)),
    });
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const row = yield* db
      .first(
        "SELECT d.id AS id FROM devices d JOIN device_sessions s ON s.device_id = d.id WHERE (d.token_hash = ? OR d.previous_token_hash = ?) AND d.revoked_at IS NULL AND s.session_id = ?",
        [hash, hash, sessionId],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      return null;
    }
    const deviceId = String(row.id);
    yield* db
      .run("UPDATE devices SET last_seen_at = ? WHERE id = ?", [
        new Date().toISOString(),
        deviceId,
      ])
      .pipe(Effect.orDie);
    return deviceId;
  });

export const scopeSession = (
  db: DatabaseImpl,
  deviceId: string,
  sessionId: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO device_sessions (device_id, session_id, created_at) VALUES (?, ?, ?) ON CONFLICT(device_id, session_id) DO NOTHING",
      [deviceId, sessionId, new Date().toISOString()],
    )
    .pipe(Effect.orDie);

export const revokeDevice = (
  db: DatabaseImpl,
  userId: string,
  deviceId: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const now = new Date().toISOString();
    const changed = yield* db
      .changed(
        "UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
        [now, deviceId, userId],
      )
      .pipe(Effect.orDie);
    if (changed === 0) {
      return false;
    }
    const sessions = yield* db
      .all("SELECT session_id AS sessionId FROM device_sessions WHERE device_id = ?", [deviceId])
      .pipe(Effect.orDie);
    yield* Effect.forEach(
      sessions,
      (row) => closeTransports(db, String(row.sessionId), ["desktop"]),
      { concurrency: 3 },
    );
    return true;
  });
