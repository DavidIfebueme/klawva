import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export type BundleDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

const versionParts = (version: string): ReadonlyArray<number> | null => {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }
  return parts;
};

export const compareVersions = (a: string, b: string): number => {
  const left = versionParts(a);
  const right = versionParts(b);
  if (left === null || right === null) {
    return 0;
  }
  for (let i = 0; i < 3; i++) {
    if (left[i]! !== right[i]!) {
      return left[i]! < right[i]! ? -1 : 1;
    }
  }
  return 0;
};

export const sha256Hex = (bytes: Uint8Array): Effect.Effect<string> =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });

export const verifyAuthorSignature = (
  publicKeyBase64: string,
  signatureBase64: string,
  payload: Uint8Array,
): Effect.Effect<boolean> =>
  Effect.promise(async () => {
    try {
      const keyBytes = Uint8Array.from(atob(publicKeyBase64), (char) =>
        char.charCodeAt(0),
      );
      const signature = Uint8Array.from(atob(signatureBase64), (char) =>
        char.charCodeAt(0),
      );
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      return await crypto.subtle.verify("Ed25519", key, signature, payload);
    } catch {
      return false;
    }
  });

export interface PublishBundleInput {
  readonly bundleId: string;
  readonly authorId: string;
  readonly version: string;
  readonly bytes: Uint8Array;
  readonly signature: string;
  readonly capabilities: unknown;
  readonly minSupported?: string;
}

export const publishBundle = (
  db: DatabaseImpl,
  input: PublishBundleInput,
): Effect.Effect<{ version: string; sha256: string }, Error> =>
  Effect.gen(function* () {
    const parts = versionParts(input.version);
    if (parts === null) {
      return yield* Effect.fail(new Error("bad_version"));
    }
    const sha256 = yield* sha256Hex(input.bytes);
    const now = new Date().toISOString();
    const existing = yield* db
      .first(
        "SELECT latest_version AS latest, min_supported AS minSupported FROM desktop_bundles WHERE id = ?",
        [input.bundleId],
      )
      .pipe(Effect.orDie);
    if (existing !== null && compareVersions(input.version, String(existing.latest)) <= 0) {
      return yield* Effect.fail(new Error("version_not_monotonic"));
    }
    const minSupported = input.minSupported ?? String(existing?.minSupported ?? input.version);

    if (existing === null) {
      yield* db
        .run(
          "INSERT INTO desktop_bundles (id, author_id, latest_version, min_supported, created_at) VALUES (?, ?, ?, ?, ?)",
          [input.bundleId, input.authorId, input.version, minSupported, now],
        )
        .pipe(Effect.orDie);
    } else {
      yield* db
        .run(
          "UPDATE desktop_bundles SET latest_version = ?, min_supported = ? WHERE id = ?",
          [input.version, minSupported, input.bundleId],
        )
        .pipe(Effect.orDie);
    }

    yield* db
      .run(
        "INSERT INTO bundle_versions (id, bundle_id, version, sha256, signature, capabilities, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'published', ?)",
        [
          crypto.randomUUID(),
          input.bundleId,
          input.version,
          sha256,
          input.signature,
          JSON.stringify(input.capabilities),
          now,
        ],
      )
      .pipe(Effect.orDie);

    return { version: input.version, sha256 };
  });

export const revokeBundleVersion = (
  db: DatabaseImpl,
  bundleId: string,
  version: string,
  reason: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO bundle_revocations (bundle_id, version, reason, revoked_at) VALUES (?, ?, ?, ?) ON CONFLICT(bundle_id, version) DO UPDATE SET reason = excluded.reason, revoked_at = excluded.revoked_at",
      [bundleId, version, reason, new Date().toISOString()],
    )
    .pipe(Effect.orDie);

export const bundleAllowed = (
  db: DatabaseImpl,
  params: {
    readonly bundleId: string;
    readonly version: string;
    readonly sha256: string;
  },
): Effect.Effect<BundleDecision> =>
  Effect.gen(function* () {
    const bundle = yield* db
      .first(
        "SELECT min_supported AS minSupported FROM desktop_bundles WHERE id = ?",
        [params.bundleId],
      )
      .pipe(Effect.orDie);
    if (bundle === null) {
      return { allowed: false as const, reason: "bundle_unknown" };
    }
    if (compareVersions(params.version, String(bundle.minSupported)) < 0) {
      return { allowed: false as const, reason: "below_floor" };
    }
    const revoked = yield* db
      .first(
        "SELECT version AS version FROM bundle_revocations WHERE bundle_id = ? AND version = ?",
        [params.bundleId, params.version],
      )
      .pipe(Effect.orDie);
    if (revoked !== null) {
      return { allowed: false as const, reason: "revoked" };
    }
    const known = yield* db
      .first(
        "SELECT sha256 AS sha256 FROM bundle_versions WHERE bundle_id = ? AND version = ?",
        [params.bundleId, params.version],
      )
      .pipe(Effect.orDie);
    if (known === null) {
      return { allowed: false as const, reason: "version_unknown" };
    }
    if (String(known.sha256) !== params.sha256) {
      return { allowed: false as const, reason: "hash_mismatch" };
    }
    return { allowed: true as const };
  });

export const grantBundle = (
  db: DatabaseImpl,
  deviceId: string,
  bundleId: string,
  version: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO bundle_grants (device_id, bundle_id, version, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT(device_id, bundle_id) DO UPDATE SET version = excluded.version, granted_at = excluded.granted_at, revoked_at = NULL",
      [deviceId, bundleId, version, new Date().toISOString()],
    )
    .pipe(Effect.orDie);

export const bundleGranted = (
  db: DatabaseImpl,
  deviceId: string,
  bundleId: string,
): Effect.Effect<boolean> =>
  db
    .first(
      "SELECT version AS version FROM bundle_grants WHERE device_id = ? AND bundle_id = ? AND revoked_at IS NULL",
      [deviceId, bundleId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => row !== null),
    );
