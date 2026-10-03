import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param } from "../db/database.ts";
import { sendEmail } from "../email/brevo.ts";
import { listingApprovedEmail, listingRejectedEmail } from "../email/templates.ts";
import type { Env } from "../env.ts";
import { ListingConflict, ListingNotFound } from "../errors.ts";
import { seedListings } from "../listings/listings.ts";

const scalar = (
  db: DatabaseImpl,
  sql: string,
  params: ReadonlyArray<Param> = [],
): Effect.Effect<number> =>
  db
    .first(sql, params)
    .pipe(
      Effect.orDie,
      Effect.flatMap((row) => {
        if (row === null) {
          return Effect.die("count_row_missing");
        }
        const [first] = Object.values(row);
        if (first === undefined) {
          return Effect.die("count_value_missing");
        }
        return Effect.succeed(Number(first));
      }),
    );

export interface Overview {
  readonly users: number;
  readonly authors: number;
  readonly sessions: number;
  readonly pendingReviews: number;
  readonly listingsByStatus: ReadonlyArray<{
    readonly status: string;
    readonly count: number;
  }>;
}

export const overview = (db: DatabaseImpl): Effect.Effect<Overview> =>
  Effect.gen(function* () {
    const users = yield* scalar(db, "SELECT COUNT(*) AS n FROM users");
    const authors = yield* scalar(db, "SELECT COUNT(*) AS n FROM author_profiles");
    const sessions = yield* scalar(db, "SELECT COUNT(*) AS n FROM sessions");
    const pendingReviews = yield* scalar(
      db,
      "SELECT COUNT(*) AS n FROM agent_listings WHERE status = 'in_review'",
    );
    const rows = yield* db
      .all(
        "SELECT status AS status, COUNT(*) AS count FROM agent_listings GROUP BY status",
        [],
      )
      .pipe(Effect.orDie);
    return {
      users,
      authors,
      sessions,
      pendingReviews,
      listingsByStatus: rows.map((row) => ({
        status: String(row.status),
        count: Number(row.count),
      })),
    };
  });

export const reviewQueue = (
  db: DatabaseImpl,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>> =>
  db
    .all(
      "SELECT l.id AS id, l.slug AS slug, l.name AS name, l.price_minor AS priceMinor, l.owner_id AS ownerId, u.email AS ownerEmail, v.score AS score, v.soul AS soul FROM agent_listings l LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.status = 'in_review' AND l.owner_id != 'system' ORDER BY l.updated_at ASC",
      [],
    )
    .pipe(Effect.orDie);

const recordAudit = (
  db: DatabaseImpl,
  actorEmail: string,
  action: string,
  targetId: string,
  detail: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO admin_audit (id, actor_email, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, 'listing', ?, ?, ?)",
      [
        crypto.randomUUID(),
        actorEmail,
        action,
        targetId,
        detail,
        new Date().toISOString(),
      ],
    )
    .pipe(Effect.orDie);

const notifyOwner = (
  db: DatabaseImpl,
  env: Env,
  ownerId: string,
  subject: string,
  body: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const owner = yield* db
      .first("SELECT email AS email FROM users WHERE id = ?", [ownerId])
      .pipe(Effect.orDie);
    if (owner === null) {
      return;
    }
    yield* sendEmail({
      apiKey: env.BREVO_API_KEY,
      senderEmail: env.BREVO_SENDER_EMAIL,
      senderName: "Klawva",
      toEmail: String(owner.email),
      subject,
      html: body,
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => console.error("owner_notification_failed", error)),
      ),
    );
  });

const loadOwner = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<{ ownerId: string; name: string }, ListingNotFound> =>
  Effect.gen(function* () {
    const listing = yield* db
      .first(
        "SELECT owner_id AS ownerId, name AS name FROM agent_listings WHERE id = ?",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    return { ownerId: String(listing.ownerId), name: String(listing.name) };
  });

export const approveListing = (
  db: DatabaseImpl,
  env: Env,
  actorEmail: string,
  listingId: string,
): Effect.Effect<{ status: string }, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* loadOwner(db, listingId);
    const now = new Date().toISOString();
    const updated = yield* db
      .first(
        "UPDATE agent_listings SET status = 'published', updated_at = ? WHERE id = ? AND status = 'in_review' RETURNING id AS id",
        [now, listingId],
      )
      .pipe(Effect.orDie);
    if (updated === null) {
      return yield* Effect.fail(new ListingConflict({ reason: "not_in_review" }));
    }
    yield* db
      .run(
        "UPDATE listing_versions SET reviewed_by = ?, reviewed_at = ? WHERE listing_id = ? AND version = (SELECT current_version FROM agent_listings WHERE id = ?)",
        [actorEmail, now, listingId, listingId],
      )
      .pipe(Effect.orDie);
    yield* recordAudit(db, actorEmail, "listing.approve", listingId, "{}");
    yield* notifyOwner(
      db,
      env,
      listing.ownerId,
      "Your Klawva employee is live",
      listingApprovedEmail(listing.name),
    );
    return { status: "published" };
  });

export const rejectListing = (
  db: DatabaseImpl,
  env: Env,
  actorEmail: string,
  listingId: string,
  reason: string,
): Effect.Effect<{ status: string }, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* loadOwner(db, listingId);
    const now = new Date().toISOString();
    const updated = yield* db
      .first(
        "UPDATE agent_listings SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'in_review' RETURNING id AS id",
        [now, listingId],
      )
      .pipe(Effect.orDie);
    if (updated === null) {
      return yield* Effect.fail(new ListingConflict({ reason: "not_in_review" }));
    }
    yield* db
      .run(
        "UPDATE listing_versions SET reviewed_by = ?, reviewed_at = ? WHERE listing_id = ? AND version = (SELECT current_version FROM agent_listings WHERE id = ?)",
        [actorEmail, now, listingId, listingId],
      )
      .pipe(Effect.orDie);
    yield* recordAudit(
      db,
      actorEmail,
      "listing.reject",
      listingId,
      JSON.stringify({ reason }),
    );
    yield* notifyOwner(
      db,
      env,
      listing.ownerId,
      "Your Klawva employee needs changes",
      listingRejectedEmail(listing.name, reason),
    );
    return { status: "rejected" };
  });

export const seed = (db: DatabaseImpl): Effect.Effect<number> =>
  seedListings(db).pipe(Effect.orDie);

export const auditLog = (
  db: DatabaseImpl,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>> =>
  db
    .all(
      "SELECT id AS id, actor_email AS actorEmail, action AS action, target_id AS targetId, detail AS detail, created_at AS createdAt FROM admin_audit ORDER BY created_at DESC LIMIT 100",
      [],
    )
    .pipe(Effect.orDie);
