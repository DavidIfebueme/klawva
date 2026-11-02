import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import { Brief, manifestOf } from "../db/schema.ts";
import { placePhoneHire, type PhoneEnv } from "./placement.ts";

export const retryPendingDials = (
  db: DatabaseImpl,
  env: PhoneEnv,
  at: Date,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const stale = new Date(at.getTime() - 300_000).toISOString();
    const rows = yield* db
      .all(
        `SELECT t.id AS transportId, s.id AS sessionId, s.brief AS brief,
                s.budget_minor - s.spent_minor AS remaining,
                v.manifest AS manifest, l.name AS listingName
         FROM session_transports t
         JOIN sessions s ON s.id = t.session_id
         JOIN listing_versions v ON v.listing_id = s.listing_id AND v.version = s.listing_version
         JOIN agent_listings l ON l.id = s.listing_id
         WHERE t.type = 'phone_out' AND t.state = 'pending' AND t.carrier_ref IS NULL
           AND t.attempt_count < 3
           AND (t.dialing_at IS NULL OR t.dialing_at < ?)
           AND (t.retry_after IS NULL OR t.retry_after <= ?)
           AND s.state = 'active'
           AND s.window_end IS NOT NULL AND s.window_end > ?
         ORDER BY t.created_at ASC
         LIMIT 20`,
        [stale, at.toISOString(), at.toISOString()],
      )
      .pipe(Effect.orDie);
    let dialed = 0;
    for (const row of rows) {
      const manifest = manifestOf({
        soul: "",
        manifest: typeof row.manifest === "string" ? row.manifest : null,
      });
      if (manifest.phone === undefined || !manifest.phone.outbound) {
        continue;
      }
      const brief = Schema.decodeUnknownOption(Brief)(
        String(row.brief ?? "{}"),
      );
      const outcome = yield* placePhoneHire(
        env,
        db,
        {
          sessionId: String(row.sessionId),
          agentName: String(row.listingName),
          manifest,
          brief: brief._tag === "Some" ? brief.value : {},
          budgetRemainingKobo: Number(row.remaining),
        },
        at,
      );
      if (outcome.dialed) {
        dialed += 1;
      }
    }
    return dialed;
  });
