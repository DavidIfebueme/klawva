import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import {
  transportTransitions,
  TransportState,
  type TransportType,
} from "../db/schema.ts";

export class IllegalTransportTransition extends Schema.TaggedError<IllegalTransportTransition>()(
  "IllegalTransportTransition",
  {
    from: TransportState,
    to: TransportState,
  },
) {}

export const canTransitionTransport = (from: TransportState, to: TransportState): boolean =>
  transportTransitions[from].includes(to);

export const transitionTransport = (
  from: TransportState,
  to: TransportState,
): Effect.Effect<TransportState, IllegalTransportTransition> =>
  canTransitionTransport(from, to)
    ? Effect.succeed(to)
    : Effect.fail(new IllegalTransportTransition({ from, to }));

export const projectTransports = (
  db: DatabaseImpl,
  sessionId: string,
  types: ReadonlyArray<TransportType>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const now = new Date().toISOString();
    for (const type of new Set(types)) {
      const existing = yield* db
        .first(
          "SELECT id AS id FROM session_transports WHERE session_id = ? AND type = ? AND carrier_ref IS NULL",
          [sessionId, type],
        )
        .pipe(Effect.orDie);
      if (existing !== null) {
        continue;
      }
      yield* db
        .run(
          "INSERT INTO session_transports (id, session_id, type, state, carrier, carrier_ref, created_at, updated_at) VALUES (?, ?, ?, 'pending', NULL, NULL, ?, ?)",
          [crypto.randomUUID(), sessionId, type, now, now],
        )
        .pipe(Effect.orDie);
    }
  });

export const bindTransport = (
  db: DatabaseImpl,
  sessionId: string,
  type: TransportType,
  carrier: string,
  carrierRef: string,
): Effect.Effect<void, IllegalTransportTransition> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT state AS state FROM session_transports WHERE session_id = ? AND type = ? AND carrier_ref IS NULL",
        [sessionId, type],
      )
      .pipe(Effect.orDie);
    const now = new Date().toISOString();
    if (row === null) {
      yield* db
        .run(
          "INSERT INTO session_transports (id, session_id, type, state, carrier, carrier_ref, created_at, updated_at) VALUES (?, ?, ?, 'bound', ?, ?, ?, ?)",
          [crypto.randomUUID(), sessionId, type, carrier, carrierRef, now, now],
        )
        .pipe(Effect.orDie);
      return;
    }
    const from = Schema.decodeUnknownSync(TransportState)(row.state);
    yield* transitionTransport(from, "bound");
    yield* db
      .run(
        "UPDATE session_transports SET state = 'bound', carrier = ?, carrier_ref = ?, updated_at = ? WHERE session_id = ? AND type = ? AND carrier_ref IS NULL",
        [carrier, carrierRef, now, sessionId, type],
      )
      .pipe(Effect.orDie);
  });

export const closeTransports = (
  db: DatabaseImpl,
  sessionId: string,
  types?: ReadonlyArray<TransportType>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const now = new Date().toISOString();
    if (types === undefined || types.length === 0) {
      yield* db
        .run(
          "UPDATE session_transports SET state = 'closed', updated_at = ? WHERE session_id = ? AND state != 'closed'",
          [now, sessionId],
        )
        .pipe(Effect.orDie);
      return;
    }
    const slots = types.map(() => "?").join(", ");
    yield* db
      .run(
        `UPDATE session_transports SET state = 'closed', updated_at = ? WHERE session_id = ? AND state != 'closed' AND type IN (${slots})`,
        [now, sessionId, ...types],
      )
      .pipe(Effect.orDie);
  });
