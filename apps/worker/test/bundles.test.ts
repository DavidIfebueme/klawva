import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  bundleAllowed,
  bundleGranted,
  compareVersions,
  grantBundle,
  publishBundle,
  revokeBundleVersion,
} from "../src/desktop/bundles.ts";

const fakeDb = (rows: ReadonlyArray<{ prefix: string; row: Row | null }> = []) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const find = (sql: string) => rows.find((entry) => sql.startsWith(entry.prefix));
  const db: DatabaseImpl = {
    all: () => Effect.succeed([]),
    first: (sql) => Effect.succeed(find(String(sql))?.row ?? null),
    run: (sql, params) => {
      writes.push({ sql: String(sql), params: params ?? [] });
      return Effect.void;
    },
    batch: (statements) => {
      for (const statement of statements) {
        writes.push({ sql: statement.sql, params: statement.params ?? [] });
      }
      return Effect.void;
    },
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

const bytes = new TextEncoder().encode("clicky binary");

const authorKeys = (await crypto.subtle.generateKey("Ed25519", true, [
  "sign",
  "verify",
])) as CryptoKeyPair;
const authorPublicJwk = (await crypto.subtle.exportKey(
  "jwk",
  authorKeys.publicKey,
)) as JsonWebKey;
const authorPublicKey = btoa(JSON.stringify(authorPublicJwk));
const signBytes = async (payload: Uint8Array): Promise<string> => {
  const signature = await crypto.subtle.sign("Ed25519", authorKeys.privateKey, payload);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

describe("version compare", () => {
  it("orders semver triples", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("publish", () => {
  it("publishes a signed first version, records the hash, and writes the countersignature", async () => {
    const { db, writes } = fakeDb();
    const result = await Effect.runPromise(
      publishBundle(
        db,
        { AUTH_SECRET: "secret" },
        {
          bundleId: "clicky",
          authorId: "u1",
          version: "1.0.0",
          bytes,
          signature: await signBytes(bytes),
          authorPublicKey,
          capabilities: { screen: "read" },
        },
      ),
    );
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(writes.some((w) => w.sql.includes("INSERT INTO desktop_bundles"))).toBe(true);
    const versionRow = writes.find((w) => w.sql.includes("INSERT INTO bundle_versions"));
    expect(versionRow).toBeDefined();
    expect(String(versionRow?.params[5] ?? "").length).toBeGreaterThan(0);
  });

  it("refuses an unsigned bundle", async () => {
    const { db } = fakeDb();
    const exit = await Effect.runPromiseExit(
      publishBundle(
        db,
        { AUTH_SECRET: "secret" },
        {
          bundleId: "clicky",
          authorId: "u1",
          version: "1.0.0",
          bytes,
          signature: "",
          authorPublicKey: null,
          capabilities: {},
        },
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("refuses a bundle whose signature does not match the bytes", async () => {
    const { db } = fakeDb();
    const exit = await Effect.runPromiseExit(
      publishBundle(
        db,
        { AUTH_SECRET: "secret" },
        {
          bundleId: "clicky",
          authorId: "u1",
          version: "1.0.0",
          bytes,
          signature: await signBytes(new TextEncoder().encode("other bytes")),
          authorPublicKey,
          capabilities: {},
        },
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("refuses a version that does not move forward", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT latest_version AS latest", row: { latest: "1.2.0", minSupported: "1.0.0" } },
    ]);
    const exit = await Effect.runPromiseExit(
      publishBundle(
        db,
        { AUTH_SECRET: "secret" },
        {
          bundleId: "clicky",
          authorId: "u1",
          version: "1.2.0",
          bytes,
          signature: await signBytes(bytes),
          authorPublicKey,
          capabilities: {},
        },
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("never lowers the version floor", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: (sql) =>
        Effect.succeed(
          String(sql).startsWith("SELECT latest_version AS latest")
            ? { latest: "2.0.0", minSupported: "1.5.0" }
            : null,
        ),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: params ?? [] });
        return Effect.void;
      },
      batch: (statements) => {
        for (const statement of statements) {
          writes.push({ sql: statement.sql, params: statement.params ?? [] });
        }
        return Effect.void;
      },
      changed: () => Effect.succeed(0),
    };
    await Effect.runPromise(
      publishBundle(
        db,
        { AUTH_SECRET: "secret" },
        {
          bundleId: "clicky",
          authorId: "u1",
          version: "2.1.0",
          bytes,
          signature: await signBytes(bytes),
          authorPublicKey,
          capabilities: {},
          minSupported: "0.0.1",
        },
      ),
    );
    const bundleWrite = writes.find((w) => w.sql.includes("UPDATE desktop_bundles"));
    expect(bundleWrite?.params[1]).toBe("1.5.0");
  });

  it("refuses a malformed version", async () => {
    const { db } = fakeDb();
    const exit = await Effect.runPromiseExit(
      publishBundle(
        db,
        { AUTH_SECRET: "secret" },
        {
          bundleId: "clicky",
          authorId: "u1",
          version: "latest",
          bytes,
          signature: await signBytes(bytes),
          authorPublicKey,
          capabilities: {},
        },
      ),
    );
    expect(exit._tag).toBe("Failure");
  });
});

describe("install decisions", () => {
  const floor = { prefix: "SELECT min_supported AS minSupported", row: { minSupported: "1.1.0" } };
  const known = { prefix: "SELECT sha256 AS sha256 FROM bundle_versions", row: { sha256: "abc" } };

  it("refuses a version below the floor", async () => {
    const { db } = fakeDb([floor]);
    const decision = await Effect.runPromise(
      bundleAllowed(db, { bundleId: "clicky", version: "1.0.0", sha256: "abc" }),
    );
    expect(decision).toEqual({ allowed: false, reason: "below_floor" });
  });

  it("refuses a revoked version even when the hash matches", async () => {
    const { db } = fakeDb([
      floor,
      { prefix: "SELECT version AS version FROM bundle_revocations", row: { version: "1.2.0" } },
    ]);
    const decision = await Effect.runPromise(
      bundleAllowed(db, { bundleId: "clicky", version: "1.2.0", sha256: "abc" }),
    );
    expect(decision).toEqual({ allowed: false, reason: "revoked" });
  });

  it("refuses a tampered hash", async () => {
    const { db } = fakeDb([floor, { prefix: "SELECT sha256 AS sha256 FROM bundle_versions", row: { sha256: "different" } }]);
    const decision = await Effect.runPromise(
      bundleAllowed(db, { bundleId: "clicky", version: "1.2.0", sha256: "abc" }),
    );
    expect(decision).toEqual({ allowed: false, reason: "hash_mismatch" });
  });

  it("allows a known, unrevoked, in-floor version", async () => {
    const { db } = fakeDb([
      floor,
      { prefix: "SELECT version AS version FROM bundle_revocations", row: null },
      known,
    ]);
    const decision = await Effect.runPromise(
      bundleAllowed(db, { bundleId: "clicky", version: "1.2.0", sha256: "abc" }),
    );
    expect(decision.allowed).toBe(true);
  });

  it("refuses an unknown bundle", async () => {
    const { db } = fakeDb();
    const decision = await Effect.runPromise(
      bundleAllowed(db, { bundleId: "nope", version: "1.0.0", sha256: "abc" }),
    );
    expect(decision).toEqual({ allowed: false, reason: "bundle_unknown" });
  });
});

describe("grants and revocation rows", () => {
  it("a grant is written by code, keyed to the device", async () => {
    const { db, writes } = fakeDb();
    await Effect.runPromise(grantBundle(db, "d1", "clicky", "1.2.0"));
    expect(writes[0].sql).toContain("INSERT INTO bundle_grants");
    expect(writes[0].params[0]).toBe("d1");
  });

  it("a granted bundle reads back as granted", async () => {
    const { db } = fakeDb([{ prefix: "SELECT version AS version FROM bundle_grants", row: { version: "1.2.0" } }]);
    expect(await Effect.runPromise(bundleGranted(db, "d1", "clicky"))).toBe(true);
  });

  it("revocation names the exact version", async () => {
    const { db, writes } = fakeDb();
    await Effect.runPromise(revokeBundleVersion(db, "clicky", "1.2.0", "exfil"));
    expect(writes[0].sql).toContain("INSERT INTO bundle_revocations");
    expect(writes[0].params[1]).toBe("1.2.0");
  });
});
