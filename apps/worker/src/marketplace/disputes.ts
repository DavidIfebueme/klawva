import * as Effect from "effect/Effect";
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
): Effect.Effect<string> =>
  Effect.gen(function* () {
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
          input.reason,
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

/**
 * a refund and its dispute are written together. a refund that cannot name a
 * dispute is a bug, so the only way to write one is through this function.
 */
export const recordRefund = (
  db: DatabaseImpl,
  input: RefundInput,
): Effect.Effect<{ disputeId: string; structural: boolean }> =>
  Effect.gen(function* () {
    const disputeId = yield* openDispute(db, {
      sessionId: input.sessionId,
      taskId: input.taskId,
      briefHash: input.briefHash,
      artifactHash: input.artifactHash,
      openedBy: input.openedBy ?? "customer",
      reason: input.reason,
    });
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE payments SET refund_minor = ?, refunded_at = ?, refund_source = ?, refund_psp_id = ?, refund_task_id = ?, refund_reason = ? WHERE session_id = ? AND refund_psp_id IS NULL",
        [
          input.refundMinor,
          now,
          input.refundSource,
          input.refundPspId,
          input.taskId,
          input.reason,
          input.sessionId,
        ],
      )
      .pipe(Effect.orDie);
    yield* db
      .run(
        "UPDATE disputes SET state = 'resolved_refund', refund_ref = ?, resolved_at = ? WHERE id = ?",
        [input.refundPspId, now, disputeId],
      )
      .pipe(Effect.orDie);
    return { disputeId, structural: isStructuralRefund(input.reason) };
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
