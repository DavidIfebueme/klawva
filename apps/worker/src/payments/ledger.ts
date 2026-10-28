import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export const closeBatchQuery =
  "SELECT s.author_id AS authorId, SUM(s.gross_minor) AS grossMinor, SUM(s.commission_minor) AS commissionMinor, SUM(s.net_minor) AS netMinor, COALESCE(a.psp,'paystack') AS psp, COALESCE(a.subaccount, 'unlinked') AS subaccount, COALESCE(a.currency, 'NGN') AS currency FROM payment_splits s LEFT JOIN payout_accounts a ON a.rowid = (SELECT p.rowid FROM payout_accounts p WHERE p.author_id = s.author_id ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END, p.psp LIMIT 1) WHERE substr(s.created_at, 1, 7) = ? GROUP BY s.author_id";

export const VAT_RATE = 0.075;
export const WHT_NON_RESIDENT = 0.1;

export interface InstructionInput {
  readonly authorId: string;
  readonly period: string;
  readonly psp: string;
  readonly subaccount: string;
  readonly currency: string;
  readonly grossMinor: number;
  readonly commissionMinor: number;
  readonly netMinor: number;
  readonly fxRate?: number;
  readonly whtRate?: number;
}

export const computeInstruction = (input: InstructionInput) => {
  const vatMinor = Math.round(input.commissionMinor * VAT_RATE);
  const whtMinor = Math.round(input.netMinor * (input.whtRate ?? 0));
  return {
    grossMinor: input.grossMinor,
    commissionMinor: input.commissionMinor,
    vatMinor,
    whtMinor,
    netMinor: input.netMinor - whtMinor,
  };
};

/**
 * one row per author, period and subaccount, written once.
 * a rerun of the same period is a no-op, because recomputing a batch from live
 * sessions would rewrite history the moment a refund or a price edit lands.
 */
export const closeBatch = (
  db: DatabaseImpl,
  period: string,
  now: string = new Date().toISOString(),
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const rows = yield* db
      .all(
        closeBatchQuery,
        [period],
      )
      .pipe(Effect.orDie);
    const written: string[] = [];
    for (const row of rows) {
      const totals = computeInstruction({
        authorId: String(row.authorId),
        period,
        psp: String(row.psp),
        subaccount: String(row.subaccount),
        currency: String(row.currency),
        grossMinor: Number(row.grossMinor),
        commissionMinor: Number(row.commissionMinor),
        netMinor: Number(row.netMinor),
      });
      const inserted = yield* db
        .first(
          "INSERT INTO payout_instructions (id, author_id, period, psp, subaccount, gross_minor, currency, fx_rate, commission_minor, vat_minor, wht_minor, net_minor, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(author_id, period, subaccount) DO NOTHING RETURNING id AS id",
          [
            crypto.randomUUID(),
            String(row.authorId),
            period,
            String(row.psp),
            String(row.subaccount),
            totals.grossMinor,
            String(row.currency),
            null,
            totals.commissionMinor,
            totals.vatMinor,
            totals.whtMinor,
            totals.netMinor,
            now,
          ],
        )
        .pipe(Effect.orDie);
      if (inserted !== null) {
        written.push(String(inserted.id));
      }
    }
    return written;
  });

export const recordTransfer = (
  db: DatabaseImpl,
  instructionId: string,
  transferId: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE payout_instructions SET psp_transfer_id = ?, status = 'sent' WHERE id = ? AND status = 'pending'",
      [transferId, instructionId],
    )
    .pipe(Effect.orDie);

export const recordReversal = (
  db: DatabaseImpl,
  instructionId: string,
  refundPspId: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE payout_instructions SET reversal_ref = ?, status = 'reversed' WHERE id = ?",
      [refundPspId, instructionId],
    )
    .pipe(Effect.orDie);
