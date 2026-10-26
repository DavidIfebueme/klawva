import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { identityFromToken, tokenFromHeaders } from "./auth.ts";
import { AuthError } from "./tokens.ts";
import { Database } from "../db/database.ts";
import { WorkerEnv } from "../env.ts";
import { ListingNotFound } from "../errors.ts";
import { pairDevice, revokeDevice, rotateToken, scopeDeviceSession } from "./devices.ts";
import {
  approvePairCode,
  claimPairCode,
  deviceIdForRawToken,
  sessionsForDevice,
} from "./pairing.ts";

const DeviceRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.String,
  lastSeenAt: Schema.NullOr(Schema.String),
  revokedAt: Schema.NullOr(Schema.String),
});

const deviceCreate = HttpApiEndpoint.post(
  "deviceCreate",
  "/api/devices",
  {
    payload: Schema.Struct({ name: Schema.String }),
    success: Schema.Struct({ id: Schema.String, token: Schema.String }),
    error: AuthError,
  },
);

const deviceList = HttpApiEndpoint.get("deviceList", "/api/devices", {
  success: Schema.Array(DeviceRow),
  error: AuthError,
});

const deviceRotate = HttpApiEndpoint.post(
  "deviceRotate",
  "/api/devices/:id/rotate",
  {
    params: Schema.Struct({ id: Schema.String }),
    success: Schema.Struct({ token: Schema.String }),
    error: [AuthError, ListingNotFound],
  },
);

const deviceRevoke = HttpApiEndpoint.post(
  "deviceRevoke",
  "/api/devices/:id/revoke",
  {
    params: Schema.Struct({ id: Schema.String }),
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: [AuthError, ListingNotFound],
  },
);

const deviceScope = HttpApiEndpoint.post(
  "deviceScope",
  "/api/devices/:id/sessions",
  {
    params: Schema.Struct({ id: Schema.String }),
    payload: Schema.Struct({ sessionId: Schema.String }),
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: AuthError,
  },
);

const DeviceSessionRow = Schema.Struct({
  id: Schema.String,
  state: Schema.String,
  listingName: Schema.NullOr(Schema.String),
});

const pairCodeApprove = HttpApiEndpoint.post(
  "pairCodeApprove",
  "/api/devices/codes",
  {
    payload: Schema.Struct({ code: Schema.String, name: Schema.String }),
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: AuthError,
  },
);

const pairCodeClaim = HttpApiEndpoint.post(
  "pairCodeClaim",
  "/api/devices/claim",
  {
    payload: Schema.Struct({ code: Schema.String }),
    success: Schema.Struct({ id: Schema.String, token: Schema.String }),
    error: [AuthError, ListingNotFound],
  },
);

const deviceSessions = HttpApiEndpoint.get(
  "deviceSessions",
  "/api/device/sessions",
  {
    success: Schema.Array(DeviceSessionRow),
    error: AuthError,
  },
);

class DevicesGroup extends HttpApiGroup.make("Devices")
  .add(deviceCreate)
  .add(deviceList)
  .add(deviceRotate)
  .add(deviceRevoke)
  .add(deviceScope)
  .add(pairCodeApprove)
  .add(pairCodeClaim)
  .add(deviceSessions) {}

export class DevicesApi extends HttpApi.make("DevicesApi").add(DevicesGroup) {}

export const devicesGroup = HttpApiBuilder.group(
  DevicesApi,
  "Devices",
  Effect.fn(function* (handlers) {
    const db = yield* Database;
    const env = yield* WorkerEnv;

    const requireIdentity = () =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = tokenFromHeaders(request.headers);
        if (token === null) {
          return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
        }
        return yield* identityFromToken(env, db, token);
      });

    return handlers
      .handle("deviceCreate", ({ payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const created = yield* pairDevice(db, identity.userId, payload.name).pipe(
            Effect.catch((cause) =>
              Effect.fail(new AuthError({ reason: String(cause) })),
            ),
          );
          return { id: created.deviceId, token: created.token };
        }),
      )
      .handle("deviceList", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const rows = yield* db
            .all(
              "SELECT id AS id, name AS name, created_at AS createdAt, last_seen_at AS lastSeenAt, revoked_at AS revokedAt FROM devices WHERE user_id = ? ORDER BY created_at DESC",
              [identity.userId],
            )
            .pipe(Effect.orDie);
          return rows.map((row) => Schema.decodeUnknownSync(DeviceRow)(row));
        }),
      )
      .handle("deviceRotate", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const rotated = yield* rotateToken(db, identity.userId, params.id).pipe(
            Effect.catch((cause) =>
              Effect.fail(new AuthError({ reason: String(cause) })),
            ),
          );
          if (rotated === null) {
            return yield* Effect.fail(new ListingNotFound({}));
          }
          return rotated;
        }),
      )
      .handle("deviceRevoke", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const revoked = yield* revokeDevice(db, identity.userId, params.id);
          if (!revoked) {
            return yield* Effect.fail(new ListingNotFound({}));
          }
          return { ok: true };
        }),
      )
      .handle("deviceScope", ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const owned = yield* db
            .first("SELECT id AS id FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL", [
              params.id,
              identity.userId,
            ])
            .pipe(Effect.orDie);
          if (owned === null) {
            return yield* Effect.fail(new AuthError({ reason: "device_not_found" }));
          }
          const scoped = yield* scopeDeviceSession(
            db,
            identity.userId,
            identity.email,
            params.id,
            payload.sessionId,
          );
          if (!scoped) {
            return yield* Effect.fail(
              new AuthError({ reason: "session_not_found" }),
            );
          }
          return { ok: true };
        }),
      )
      .handle("pairCodeApprove", ({ payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          yield* approvePairCode(db, identity.userId, payload.code, payload.name);
          return { ok: true };
        }),
      )
      .handle("pairCodeClaim", ({ payload }) =>
        Effect.gen(function* () {
          const claimed = yield* claimPairCode(db, payload.code).pipe(
            Effect.catch((cause) =>
              Effect.fail(new AuthError({ reason: String(cause) })),
            ),
          );
          if (claimed === null) {
            return yield* Effect.fail(new ListingNotFound({}));
          }
          return { id: claimed.deviceId, token: claimed.token };
        }),
      )
      .handle("deviceSessions", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const token = tokenFromHeaders(request.headers);
          if (token === null) {
            return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
          }
          const deviceId = yield* deviceIdForRawToken(db, token).pipe(
            Effect.catch(() => Effect.succeed(null)),
          );
          if (deviceId === null) {
            return yield* Effect.fail(new AuthError({ reason: "bad_device_token" }));
          }
          return yield* sessionsForDevice(db, deviceId);
        }),
      );
  }),
);
