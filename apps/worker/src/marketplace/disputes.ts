import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import { isStructuralRefund } from "../payments/split.ts";

export type DisputeState =
  | "opened"
  | "evidence_pending"
  | "resolved_refund"
  | "resolved_rerun"
  | "resolved_dismissed"
  | "escalated";

export type DisputeOpener = "customer" | "shopper_fail" | "support";

export const DISPUTE_REASONS = [
  "no_artifact",
  "revoked_midshift",
  "input_required",
  "cancel_by_us",
  "quality",
  "late_delivery",
  "other",
] as const;

export type DisputeReason = (typeof DISPUTE_REASONS)[number];

const DisputeReasonSchema = Schema.Literals(DISPUTE_REASONS);

export const disputeReason = (raw: string): DisputeReason | null => {
  const decoded = Schema.decodeUnknownOption(DisputeReasonSchema)(raw);
  return decoded._tag === "Some" ? decoded.value : null;
};

export type DisputeOpener_ = DisputeOpener;

export interface OpenDisputeInput {
  readonly sessionId: string;
  readonly taskId: string | null;
  readonly briefHash: string | null;
  readonly artifactHash: string | null;
  readonly openedBy: DisputeOpener;
  readonly reason: string;
}

export const openDispute = (
  db: DatabaseImpl,
  input: OpenDisputeInput,
): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    const reason = disputeReason(input.reason);
    if (reason === null) {
      return yield* Effect.fail(new Error(`bad_reason:${input.reason}`));
    }
    const id = crypto.randomUUID();
    yield* db
      .run(
        "INSERT INTO disputes (id, session_id, task_id, brief_hash, artifact_hash, opened_by, reason, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'opened', ?)",
        [
          id,
          input.sessionId,
          input.taskId,
          input.briefHash,
          input.artifactHash,
          input.openedBy,
          reason,
          new Date().toISOString(),
        ],
      )
      .pipe(Effect.orDie);
    return id;
  });

export interface RefundInput {
  readonly sessionId: string;
  readonly taskId: string | null;
  readonly briefHash: string | null;
  readonly artifactHash: string | null;
  readonly reason: string;
  readonly refundMinor: number;
  readonly refundSource: "psp_reversible" | "author_share_reversed" | "platform_funded";
  readonly refundPspId: string;
  readonly openedBy?: DisputeOpener;
}

export const recordRefund = (
  db: DatabaseImpl,
  input: RefundInput,
): Effect.Effect<{ disputeId: string; structural: boolean; refunded: boolean }, Error> =>
  Effect.gen(function* () {
    const reason = disputeReason(input.reason);
    if (reason === null) {
      return yield* Effect.fail(new Error(`bad_reason:${input.reason}`));
    }
    const disputeId = crypto.randomUUID();
    const now = new Date().toISOString();
    yield* db
      .batch([
        {
          sql: "INSERT INTO disputes (id, session_id, task_id, brief_hash, artifact_hash, opened_by, reason, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'opened', ?)",
          params: [
            disputeId,
            input.sessionId,
            input.taskId,
            input.briefHash,
            input.artifactHash,
            input.openedBy ?? "customer",
            reason,
            now,
          ],
        },
        {
          sql: "UPDATE payments SET refund_minor = ?, refunded_at = ?, refund_source = ?, refund_psp_id = ?, refund_task_id = ?, refund_reason = ? WHERE session_id = ? AND refund_psp_id IS NULL",
          params: [
            input.refundMinor,
            now,
            input.refundSource,
            input.refundPspId,
            input.taskId,
            input.reason,
            input.sessionId,
          ],
        },
        {
          sql: "UPDATE disputes SET state = 'resolved_refund', refund_ref = ?, resolved_at = ? WHERE id = ?",
          params: [input.refundPspId, now, disputeId],
        },
      ])
      .pipe(Effect.orDie);
    const changed = yield* db.changed(
      "SELECT 1 FROM payments WHERE session_id = ? AND refund_psp_id = ?",
      [input.sessionId, input.refundPspId],
    );
    return { disputeId, structural: isStructuralRefund(input.reason), refunded: changed > 0 };
  });

export const resolveWithRerun = (
  db: DatabaseImpl,
  disputeId: string,
  rerunSessionId: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE disputes SET state = 'resolved_rerun', rerun_session_id = ?, resolved_at = ? WHERE id = ? AND state IN ('opened','evidence_pending','escalated')",
      [rerunSessionId, new Date().toISOString(), disputeId],
    )
    .pipe(Effect.orDie);

export const createRerunSession = (
  db: DatabaseImpl,
  disputeId: string,
): Effect.Effect<{ rerunSessionId: string; listingId: string } | null, Error> =>
  Effect.gen(function* () {
    const dispute = yield* db
      .first(
        "SELECT session_id AS sessionId FROM disputes WHERE id = ? AND rerun_session_id IS NULL",
        [disputeId],
      )
      .pipe(Effect.orDie);
    if (dispute === null) {
      return null;
    }
    const original = yield* db
      .first(
        "SELECT s.listing_id AS listingId, s.user_id AS userId, s.brief AS brief, s.channel AS channel, l.category AS category, l.owner_id AS ownerId FROM sessions s JOIN agent_listings l ON l.id = s.listing_id WHERE s.id = ?",
        [String(dispute.sessionId)],
      )
      .pipe(Effect.orDie);
    if (original === null) {
      return null;
    }
    const authored = yield* db
      .first(
        "SELECT id AS id FROM agent_listings WHERE category = ? AND owner_id = 'system' AND status = 'published' ORDER BY created_at DESC LIMIT 1",
        [String(original.category)],
      )
      .pipe(Effect.orDie);
    if (authored === null) {
      return null;
    }
    const now = new Date().toISOString();
    const durationDays = 1;
    const version = yield* db
      .first(
        "SELECT current_version AS version, budget_minor AS budgetMinor FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ?",
        [String(authored.id)],
      )
      .pipe(Effect.orDie);
    const budgetMinor =
      version === null ? 0 : Number(version.budgetMinor) * durationDays;
    const rerunId = yield* (yield* Effect.promise(() => import("../app.ts"))).insertSessionRow(
      db,
      {
        userId: null,
        listingId: String(authored.id),
        listingVersion: version === null ? 1 : Number(version.version),
        agentId: "rerun",
        brief: typeof original.brief === "string" ? original.brief : "{}",
        customerEmail: null,
        budgetMinor,
        durationDays,
      },
    );
    yield* resolveWithRerun(db, disputeId, rerunId);
    return { rerunSessionId: rerunId, listingId: String(authored.id) };
  });

export const dismissDispute = (
  db: DatabaseImpl,
  disputeId: string,
  auditRef: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE disputes SET state = 'resolved_dismissed', audit_ref = ?, resolved_at = ? WHERE id = ?",
      [auditRef, new Date().toISOString(), disputeId],
    )
    .pipe(Effect.orDie);

export const escalateDispute = (
  db: DatabaseImpl,
  disputeId: string,
): Effect.Effect<void> =>
  db
    .run("UPDATE disputes SET state = 'escalated' WHERE id = ?", [disputeId])
    .pipe(Effect.orDie);

export const openDisputesForListing = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<number> =>
  db
    .first(
      "SELECT COUNT(*) AS count FROM disputes d JOIN sessions s ON s.id = d.session_id WHERE s.listing_id = ? AND d.state IN ('opened','evidence_pending','escalated')",
      [listingId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? 0 : Number(row.count))),
    );

export const openDisputeCount = (
  db: DatabaseImpl,
  period: string,
): Effect.Effect<number> =>
  db
    .first(
      "SELECT COUNT(*) AS count FROM disputes WHERE state IN ('opened','evidence_pending','escalated') AND substr(created_at, 1, 7) = ?",
      [period],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? 0 : Number(row.count))),
    );

export const openShopperFailDispute = (
  db: DatabaseImpl,
  params: {
    readonly sessionId: string;
    readonly taskId: string | null;
    readonly briefHash: string | null;
    readonly artifactHash: string | null;
  },
): Effect.Effect<string, Error> =>
  openDispute(db, {
    sessionId: params.sessionId,
    taskId: params.taskId,
    briefHash: params.briefHash,
    artifactHash: params.artifactHash,
    openedBy: "shopper_fail",
    reason: "quality",
  });

export const autoRefundForTask = (
  db: DatabaseImpl,
  params: {
    readonly sessionId: string;
    readonly taskId: string;
    readonly briefHash: string | null;
    readonly artifactHash: string | null;
    readonly reason: "no_artifact" | "revoked_midshift" | "input_required" | "cancel_by_us";
  },
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const payment = yield* db
      .first(
        "SELECT id AS id, amount_minor AS amountMinor, refund_psp_id AS refunded FROM payments WHERE session_id = ? AND status = 'confirmed' LIMIT 1",
        [params.sessionId],
      )
      .pipe(Effect.orDie);
    if (payment === null || payment.refunded !== null) {
      return false;
    }
    const result = yield* recordRefund(db, {
      sessionId: params.sessionId,
      taskId: params.taskId,
      briefHash: params.briefHash,
      artifactHash: params.artifactHash,
      reason: params.reason,
      refundMinor: Number(payment.amountMinor),
      refundSource: "platform_funded",
      refundPspId: `rf_${crypto.randomUUID()}`,
      openedBy: "support",
    }).pipe(Effect.catch(() => Effect.succeed(null)));
    return result !== null;
  });
