import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export const shopperCadence = {
  hostedNewListingDays: 30,
  hostedNewListingEveryDays: 7,
  steadyEveryDays: 30,
  desktopTopVolumeEveryDays: 30,
} as const;

export const MIN_DAYS_BETWEEN = 3;

export const cadenceFor = (params: {
  readonly lane: "hosted" | "desktop";
  readonly listingAgeDays: number;
  readonly topVolume: boolean;
}): { readonly due: boolean; readonly everyDays: number } => {
  if (params.lane === "desktop") {
    return { due: params.topVolume, everyDays: shopperCadence.desktopTopVolumeEveryDays };
  }
  if (params.listingAgeDays <= shopperCadence.hostedNewListingDays) {
    return { due: true, everyDays: shopperCadence.hostedNewListingEveryDays };
  }
  return { due: true, everyDays: shopperCadence.steadyEveryDays };
};

const hash = (seed: string): number => {
  let value = 2_166_136_261;
  for (let i = 0; i < seed.length; i++) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16_777_619);
  }
  return Math.abs(value);
};

/** deterministic jitter per listing and day, so a fleet of shoppers never syncs up */
export const jitteredMinuteOfDay = (listingId: string, day: string): number =>
  hash(`${listingId}:${day}`) % (24 * 60);

export const shouldShopToday = (params: {
  readonly listingId: string;
  readonly today: string;
  readonly lastShoppedAt: string | null;
  readonly everyDays: number;
}): boolean => {
  if (params.lastShoppedAt === null) {
    return true;
  }
  const elapsed = Math.floor(
    (Date.parse(params.today) - Date.parse(params.lastShoppedAt)) / 86_400_000,
  );
  if (elapsed < MIN_DAYS_BETWEEN) {
    return false;
  }
  return elapsed >= params.everyDays;
};

export const neverTwoInARow = (
  lastShoppedAuthor: string | null,
  nextAuthor: string,
): boolean => lastShoppedAuthor !== nextAuthor;

export const SHOPPER_MONTHLY_CAP_MINOR = 100_000;

export const shopperSpendThisMonth = (db: DatabaseImpl): Effect.Effect<number> =>
  db
    .first(
      "SELECT COALESCE(SUM(price_minor),0) AS spent FROM shopper_audits WHERE substr(created_at, 1, 7) = ?",
      [new Date().toISOString().slice(0, 7)],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? 0 : Number(row.spent))),
    );

const SHOPPER_BRIEF = JSON.stringify({
  goal: "reply with the exact phrase KLAWVA-SHOPPER-OK and nothing else",
});

export const runDueShoppers = (
  db: DatabaseImpl,
  env: { AUTH_SECRET?: string },
  now: Date = new Date(),
): Effect.Effect<{ readonly shopped: number; readonly verdicts: number; readonly capped: boolean }> =>
  Effect.gen(function* () {
    let spend = yield* shopperSpendThisMonth(db);
    if (spend >= SHOPPER_MONTHLY_CAP_MINOR) {
      return { shopped: 0, verdicts: 0, capped: true };
    }
    const candidates = yield* db
      .all(
        "SELECT l.id AS listingId, l.owner_id AS authorId, l.price_minor AS priceMinor, l.created_at AS createdAt FROM agent_listings l WHERE l.owner_id != 'system' AND l.status = 'published' LIMIT 50",
      )
      .pipe(Effect.orDie);
    let shopped = 0;
    let verdicts = 0;
    let lastAuthor: string | null = null;
    const lastRow = yield* db
      .first(
        "SELECT l.owner_id AS authorId FROM shopper_audits a JOIN agent_listings l ON l.id = a.listing_id ORDER BY a.created_at DESC LIMIT 1",
      )
      .pipe(Effect.orDie);
    lastAuthor = lastRow === null ? null : String(lastRow.authorId);
    for (const candidate of candidates) {
      const listingId = String(candidate.listingId);
      const authorId = String(candidate.authorId);
      const priceMinor = Number(candidate.priceMinor);
      if (spend + priceMinor > SHOPPER_MONTHLY_CAP_MINOR) {
        return { shopped, verdicts, capped: true };
      }
      const manifestOfListing = yield* db
        .first(
          "SELECT v.manifest AS manifest FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ?",
          [listingId],
        )
        .pipe(Effect.orDie);
      const lane = (() => {
        if (manifestOfListing === null || manifestOfListing.manifest === null) {
          return "authored";
        }
        try {
          const parsed = JSON.parse(String(manifestOfListing.manifest)) as {
            runtime?: { kind?: string };
          };
          return parsed.runtime?.kind ?? "authored";
        } catch {
          return "authored";
        }
      })();
      if (lane !== "hosted") {
        continue;
      }
      const ageDays = Math.floor(
        (now.getTime() - Date.parse(String(candidate.createdAt ?? now.toISOString()))) / 86_400_000,
      );
      const decision = nextShopperRun(db, {
        listingId,
        lane: "hosted",
        listingAgeDays: Number.isNaN(ageDays) ? 0 : ageDays,
        topVolume: false,
        now,
      });
      const verdictDue = yield* decision;
      if (!verdictDue.run) {
        continue;
      }
      if (!neverTwoInARow(lastAuthor, authorId)) {
        continue;
      }
      const version = yield* db
        .first(
          "SELECT current_version AS version FROM agent_listings WHERE id = ?",
          [listingId],
        )
        .pipe(Effect.orDie);
      const sessionId = yield* (yield* Effect.promise(() => import("../app.ts"))).insertSessionRow(
        db,
        {
          userId: null,
          listingId,
          listingVersion: version === null ? 1 : Number(version.version),
          agentId: "shopper",
          brief: SHOPPER_BRIEF,
          customerEmail: "shopper@klawva.xyz",
          budgetMinor: 0,
          durationDays: 1,
        },
      );
      yield* db
        .run(
          "INSERT INTO shopper_audits (id, listing_id, version, session_id, verdict, notes, created_at, price_minor) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)",
          [
            crypto.randomUUID(),
            listingId,
            version === null ? "0" : String(version.version),
            sessionId,
            "payment link pending operator card",
            now.toISOString(),
            priceMinor,
          ],
        )
        .pipe(Effect.orDie);
      shopped += 1;
      lastAuthor = authorId;
      spend += priceMinor;
    }
    const pendingVerdicts = yield* db
      .all(
        "SELECT a.id AS auditId, a.session_id AS sessionId FROM shopper_audits a WHERE a.verdict = 'pending' AND EXISTS (SELECT 1 FROM mission_reports r WHERE r.session_id = a.session_id) LIMIT 20",
      )
      .pipe(Effect.orDie);
    for (const row of pendingVerdicts) {
      const report = yield* db
        .first(
          "SELECT outcome AS outcome, summary AS summary FROM mission_reports WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
          [String(row.sessionId)],
        )
        .pipe(Effect.orDie);
      const passed =
        report !== null &&
        String(report.outcome ?? "") === "complete" &&
        String(report.summary ?? "").includes("KLAWVA-SHOPPER-OK");
      const verdict = passed ? "pass" : "fail";
      yield* db
        .run(
          "UPDATE shopper_audits SET verdict = ? WHERE id = ?",
          [verdict, String(row.auditId)],
        )
        .pipe(Effect.orDie);
      verdicts += 1;
      if (!passed) {
        const { openShopperFailDispute } = yield* Effect.promise(() =>
          import("./disputes.ts"),
        );
        yield* openShopperFailDispute(db, {
          sessionId: String(row.sessionId),
          taskId: null,
          briefHash: null,
          artifactHash: null,
        }).pipe(Effect.catch(() => Effect.void));
      }
    }
    void env;
    return { shopped, verdicts, capped: false };
  });

export const lastShopperRun = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<{ lastShoppedAt: string | null; lastVerdict: string | null; lastAuthorId: string | null }> =>
  db
    .first(
      "SELECT a.created_at AS lastShoppedAt, a.verdict AS lastVerdict, l.owner_id AS lastAuthorId FROM shopper_audits a JOIN agent_listings l ON l.id = a.listing_id WHERE a.listing_id = ? ORDER BY a.created_at DESC LIMIT 1",
      [listingId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => ({
        lastShoppedAt: row === null || row.lastShoppedAt === null ? null : String(row.lastShoppedAt),
        lastVerdict: row === null || row.lastVerdict === null ? null : String(row.lastVerdict),
        lastAuthorId: row === null || row.lastAuthorId === null ? null : String(row.lastAuthorId),
      })),
    );

export const nextShopperRun = (
  db: DatabaseImpl,
  params: {
    readonly listingId: string;
    readonly lane: "hosted" | "desktop";
    readonly listingAgeDays: number;
    readonly topVolume: boolean;
    readonly now?: Date;
  },
): Effect.Effect<{ readonly run: boolean; readonly reason: string }> =>
  Effect.gen(function* () {
    const now = params.now ?? new Date();
    const cadence = cadenceFor({
      lane: params.lane,
      listingAgeDays: params.listingAgeDays,
      topVolume: params.topVolume,
    });
    if (!cadence.due) {
      return { run: false, reason: "cadence_not_due" };
    }
    const last = yield* lastShopperRun(db, params.listingId);
    const today = now.toISOString().slice(0, 10);
    const due = shouldShopToday({
      listingId: params.listingId,
      today: `${today}T00:00:00Z`,
      lastShoppedAt: last.lastShoppedAt,
      everyDays: cadence.everyDays,
    });
    if (!due) {
      return { run: false, reason: "recently_shopped" };
    }
    return {
      run: true,
      reason: `scheduled_at_${jitteredMinuteOfDay(params.listingId, today)}`,
    };
  });
