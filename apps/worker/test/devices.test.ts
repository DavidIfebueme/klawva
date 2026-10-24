import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  deviceForToken,
  issueToken,
  pairDevice,
  revokeDevice,
  rotateToken,
  scopeDeviceSession,
} from "../src/auth/devices.ts";

type Writes = Array<{ readonly sql: string; readonly params: ReadonlyArray<Param> }>;

const fakeDb = (
  rowsByPrefix: ReadonlyArray<{
    prefix: string;
    row: Row | null;
    atParams?: (params: ReadonlyArray<Param>) => boolean;
  }>,
): { db: DatabaseImpl; writes: Writes } => {
  const writes: Writes = [];
  const hit = (sql: string, params: ReadonlyArray<Param>) =>
    rowsByPrefix.find(
      (entry) =>
        sql.startsWith(entry.prefix) &&
        (entry.atParams === undefined || entry.atParams(params)),
    );
  const db: DatabaseImpl = {
    all: (sql, params) => {
      const entry = hit(sql, params ?? []);
      return Effect.succeed(
        entry !== undefined && entry.row !== null ? [entry.row] : [],
      );
    },
    first: (sql, params) => {
      const entry = hit(sql, params ?? []);
      return Effect.succeed(entry?.row ?? null);
    },
    run: (sql, params) => {
      writes.push({ sql, params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: (sql, params) => {
      writes.push({ sql, params: params ?? [] });
      return Effect.succeed(params?.[1] === "gone" ? 0 : 1);
    },
  };
  return { db, writes };
};

describe("issueToken", () => {
  it("returns a bearer token and its sha256 hash, never the same twice", async () => {
    const first = await Effect.runPromise(issueToken());
    const second = await Effect.runPromise(issueToken());
    expect(first.token).not.toBe(second.token);
    expect(first.hash).not.toBe(second.hash);
    expect(first.token).not.toContain(first.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("pairDevice", () => {
  it("stores the hash, not the raw token", async () => {
    const { db, writes } = fakeDb([]);
    const created = await Effect.runPromise(pairDevice(db, "u1", "work laptop"));
    const insert = writes.find((w) => w.sql.includes("INSERT INTO devices"));
    expect(insert).toBeDefined();
    expect(insert!.params).not.toContain(created.token);
    expect(String(insert!.params[3])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("deviceForToken", () => {
  const sessionScopedRow: Row = { id: "d1" };

  it("admits a scoped, unrevoked device and stamps last_seen", async () => {
    const { db, writes } = fakeDb([
      { prefix: "SELECT d.id", row: sessionScopedRow },
    ]);
    const id = await Effect.runPromise(deviceForToken(db, "s1", "tok"));
    expect(id).toBe("d1");
    expect(writes.some((w) => w.sql.includes("last_seen_at"))).toBe(true);
  });

  it("denies a device with no scope for the session", async () => {
    const { db } = fakeDb([{ prefix: "SELECT d.id", row: null }]);
    const id = await Effect.runPromise(deviceForToken(db, "s2", "tok"));
    expect(id).toBeNull();
  });
});

describe("rotateToken", () => {
  it("keeps the old hash as previous so a mid-rotation crash does not brick the app", async () => {
    const { db, writes } = fakeDb([
      { prefix: "SELECT token_hash", row: { tokenHash: "oldhash" } },
    ]);
    const rotated = await Effect.runPromise(rotateToken(db, "u1", "d1"));
    expect(rotated).not.toBeNull();
    const update = writes.find((w) => w.sql.includes("UPDATE devices SET previous_token_hash"));
    expect(update).toBeDefined();
    expect(update!.params[0]).toBe("oldhash");
    expect(String(update!.params[1])).toMatch(/^[0-9a-f]{64}$/);
    expect(update!.params[1]).not.toBe("oldhash");
  });

  it("returns null for a revoked or unknown device", async () => {
    const { db } = fakeDb([{ prefix: "SELECT token_hash", row: null }]);
    const rotated = await Effect.runPromise(rotateToken(db, "u1", "d1"));
    expect(rotated).toBeNull();
  });
});

describe("revokeDevice", () => {
  it("closes the desktop transports for every scoped session", async () => {
    const { db, writes } = fakeDb([
      { prefix: "SELECT session_id", row: { sessionId: "s1" } },
    ]);
    const revoked = await Effect.runPromise(revokeDevice(db, "u1", "d1"));
    expect(revoked).toBe(true);
    const close = writes.find((w) => w.sql.includes("UPDATE session_transports"));
    expect(close).toBeDefined();
    expect(close!.params).toContain("desktop");
    expect(close!.params).toContain("s1");
  });

  it("refuses to revoke a device owned by someone else", async () => {
    const { db } = fakeDb([]);
    const revoked = await Effect.runPromise(revokeDevice(db, "u1", "gone"));
    expect(revoked).toBe(false);
  });
});

describe("scopeDeviceSession", () => {
  it("refuses to scope a device to a session the caller does not own", async () => {
    const { db, writes } = fakeDb([
      {
        prefix: "SELECT 1 AS ok",
        row: null,
        atParams: (params) => params[2] === "stranger@example.com",
      },
      {
        prefix: "SELECT 1 AS ok",
        row: { ok: 1 },
      },
    ]);
    const refused = await Effect.runPromise(
      scopeDeviceSession(db, "u1", "stranger@example.com", "d1", "s-other"),
    );
    expect(refused).toBe(false);
    expect(writes.find((w) => w.sql.includes("INSERT INTO device_sessions"))).toBeUndefined();
    const admitted = await Effect.runPromise(
      scopeDeviceSession(db, "u1", "owner@example.com", "d1", "s-mine"),
    );
    expect(admitted).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO device_sessions"))).toBe(true);
  });
});

describe("rotateToken scoping", () => {
  it("refuses to rotate a device owned by another user", async () => {
    const { db } = fakeDb([
      {
        prefix: "SELECT token_hash",
        row: { tokenHash: "oldhash" },
        atParams: (params) => params[1] === "u1",
      },
    ]);
    const stranger = await Effect.runPromise(rotateToken(db, "u2", "d1"));
    expect(stranger).toBeNull();
    const owner = await Effect.runPromise(rotateToken(db, "u1", "d1"));
    expect(owner).not.toBeNull();
  });
});
