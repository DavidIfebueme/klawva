import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import type { Channel, SessionState } from "../db/schema.ts";

export interface InsertSessionRow {
  readonly userId: string | null;
  readonly listingId: string;
  readonly listingVersion: number;
  readonly agentId: string;
  readonly brief: string;
  readonly customerEmail: string | null;
  readonly budgetMinor: number;
  readonly durationDays: number;
  readonly channel?: Channel;
  readonly state?: SessionState;
  readonly windowStart?: string;
  readonly windowEnd?: string;
}

export const insertSessionRow = (
  db: DatabaseImpl,
  params: InsertSessionRow,
): Effect.Effect<string> => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return db
    .run(
      "INSERT INTO sessions (id, user_id, session_token, listing_id, listing_version, agent_id, channel, brief, state, customer_email, window_start, window_end, budget_minor, spent_minor, duration_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
      [
        id,
        params.userId,
        crypto.randomUUID().replace(/-/g, ""),
        params.listingId,
        params.listingVersion,
        params.agentId,
        params.channel ?? "web",
        params.brief,
        params.state ?? "pending",
        params.customerEmail,
        params.windowStart ?? null,
        params.windowEnd ?? null,
        params.budgetMinor,
        params.durationDays,
        now,
        now,
      ],
    )
    .pipe(
      Effect.orDie,
      Effect.map(() => id),
    );
};
