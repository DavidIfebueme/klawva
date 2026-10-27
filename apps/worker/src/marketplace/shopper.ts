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
        lastShoppedAt: row === null ? null : String(row.lastShoppedAt),
        lastVerdict: row === null ? null : String(row.lastVerdict),
        lastAuthorId: row === null ? null : String(row.lastAuthorId),
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
