import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import { pairDevice } from "./devices.ts";

const pairCodeTtlMs = 10 * 60 * 1000;

export const approvePairCode = (
  db: DatabaseImpl,
  userId: string,
  code: string,
  name: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO pair_codes (code, user_id, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET user_id = excluded.user_id, name = excluded.name, created_at = excluded.created_at",
      [code, userId, name, new Date().toISOString()],
    )
    .pipe(Effect.orDie);

export interface ClaimedCode {
  readonly deviceId: string;
  readonly token: string;
}

const pairClaimAttemptLimit = 5;

export const claimPairCode = (
  db: DatabaseImpl,
  code: string,
): Effect.Effect<ClaimedCode | null, Error> =>
  Effect.gen(function* () {
    const attemptKey = `pair-attempt:${code}`;
    const attempts = yield* db
      .first("SELECT value AS value FROM counters WHERE key = ?", [attemptKey])
      .pipe(Effect.orDie);
    if (attempts !== null && Number(attempts.value) >= pairClaimAttemptLimit) {
      return null;
    }
    const row = yield* db
      .first("SELECT user_id AS userId, name AS name, created_at AS createdAt FROM pair_codes WHERE code = ?", [code])
      .pipe(Effect.orDie);
    if (row === null) {
      yield* db
        .run(
          "INSERT INTO counters (key, value, updated_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = value + 1, updated_at = excluded.updated_at",
          [attemptKey, new Date().toISOString()],
        )
        .pipe(Effect.orDie);
      return null;
    }
    const age = Date.now() - Date.parse(String(row.createdAt));
    yield* db.run("DELETE FROM pair_codes WHERE code = ?", [code]).pipe(Effect.orDie);
    if (age > pairCodeTtlMs) {
      return null;
    }
    const created = yield* pairDevice(db, String(row.userId), String(row.name));
    return { deviceId: created.deviceId, token: created.token };
  });

export interface DeviceSessionRow {
  readonly id: string;
  readonly state: string;
  readonly listingName: string | null;
}

export const sessionsForDevice = (
  db: DatabaseImpl,
  deviceId: string,
): Effect.Effect<ReadonlyArray<DeviceSessionRow>> =>
  db
    .all(
      "SELECT s.id AS id, s.state AS state, l.name AS listingName FROM device_sessions ds JOIN sessions s ON s.id = ds.session_id LEFT JOIN agent_listings l ON l.id = s.listing_id WHERE ds.device_id = ? ORDER BY s.created_at DESC LIMIT 50",
      [deviceId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((rows) =>
        rows.map((row) => ({
          id: String(row.id),
          state: String(row.state),
          listingName: row.listingName === null ? null : String(row.listingName),
        })),
      ),
    );

export const deviceIdForRawToken = (
  db: DatabaseImpl,
  token: string,
): Effect.Effect<string | null, Error> =>
  Effect.gen(function* () {
    const digest = yield* Effect.tryPromise({
      try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      catch: (cause) => new Error(String(cause)),
    });
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const row = yield* db
      .first(
        "SELECT id AS id FROM devices WHERE (token_hash = ? OR previous_token_hash = ?) AND revoked_at IS NULL",
        [hash, hash],
      )
      .pipe(Effect.orDie);
    return row === null ? null : String(row.id);
  });
