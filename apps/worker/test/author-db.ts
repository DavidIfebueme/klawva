import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";

export interface WorldListing {
  readonly id: string;
  readonly ownerId: string;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly category: string;
  readonly status: string;
  readonly priceMinor: number;
  readonly version: number;
}

export interface WorldVersion {
  readonly listingId: string;
  readonly version: number;
  readonly soul: string;
  readonly manifest: string;
  readonly briefFields: string;
  readonly budgetMinor: number;
}

export interface WorldKitRun {
  readonly cardHash?: string;
  readonly listingId: string;
  readonly version: number;
  readonly ok: number;
  readonly ranAt: string;
  readonly detail: string;
}

export interface WorldBundle {
  readonly bundleId: string;
  readonly version: string;
  readonly sha256: string;
  readonly status: string;
}

export interface WorldSplit {
  readonly authorId: string;
  readonly grossMinor: number;
  readonly commissionMinor: number;
  readonly netMinor: number;
  readonly createdAt: string;
}

export interface World {
  readonly profile: Row | null;
  readonly listings: WorldListing[];
  readonly versions: WorldVersion[];
  readonly kitRuns: WorldKitRun[];
  readonly bundles: WorldBundle[];
  readonly desktopBundles: Array<{ readonly id: string; readonly authorId: string }>;
  readonly splits: WorldSplit[];
  readonly instructions: Row[];
  readonly payoutAccounts: Array<{ readonly currency: string; readonly status: string }>;
}

export const emptyWorld = (): World => ({
  profile: null,
  listings: [],
  versions: [],
  kitRuns: [],
  bundles: [],
  desktopBundles: [],
  splits: [],
  instructions: [],
  payoutAccounts: [],
});

const text = (params: ReadonlyArray<Param> | undefined, index: number): string =>
  String((params ?? [])[index] ?? "");

export const fakeDb = (
  world: World,
): { db: DatabaseImpl; writes: Array<{ sql: string; params: ReadonlyArray<Param> }> } => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];

  const first = (sql: string, params?: ReadonlyArray<Param>): Row | null => {
    if (
      sql.startsWith(
        "SELECT kyc_tier AS kycTier, country AS country, tin AS tin, payout_account_id AS payoutAccountId",
      )
    ) {
      return world.profile;
    }
    if (sql.startsWith("SELECT manifest AS manifest FROM listing_versions WHERE listing_id = ?")) {
      const found = world.versions.find(
        (entry) =>
          entry.listingId === text(params, 0) && entry.version === Number(params?.[1] ?? 0),
      );
      return found === undefined ? null : { manifest: found.manifest };
    }
    if (sql.startsWith("SELECT owner_id AS ownerId FROM agent_listings WHERE id = ?")) {
      const listing = world.listings.find((entry) => entry.id === text(params, 0));
      return listing === undefined ? null : { ownerId: listing.ownerId };
    }
    if (sql.startsWith("SELECT display_name AS displayName FROM author_profiles")) {
      return world.profile;
    }
    if (sql.startsWith("INSERT INTO agent_listings")) {
      const bound = params ?? [];
      world.listings.push({
        id: text(bound, 0),
        ownerId: text(bound, 1),
        slug: text(bound, 2),
        name: text(bound, 3),
        tagline: text(bound, 4),
        category: text(bound, 5),
        status: "draft",
        priceMinor: Number(bound[6]),
        version: 1,
      });
      return { id: text(bound, 0) };
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM agent_listings WHERE owner_id = ?")) {
      return {
        count: world.listings.filter((listing) => listing.ownerId === text(params, 0)).length,
      };
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM kit_runs")) {
      return {
        count: world.kitRuns.filter(
          (run) => run.listingId === text(params, 0) && run.ranAt >= text(params, 1),
        ).length,
      };
    }
    if (sql.startsWith("SELECT id AS id FROM agent_listings WHERE slug = ?")) {
      const found = world.listings.find((listing) => listing.slug === text(params, 0));
      return found === undefined ? null : { id: found.id };
    }
    if (sql.startsWith("SELECT id AS id, slug AS slug, name AS name, tagline AS tagline")) {
      const found = world.listings.find(
        (listing) => listing.id === text(params, 0) && listing.ownerId === text(params, 1),
      );
      return found === undefined
        ? null
        : {
            id: found.id,
            slug: found.slug,
            name: found.name,
            tagline: found.tagline,
            category: found.category,
            status: found.status,
            priceMinor: found.priceMinor,
            version: found.version,
          };
    }
    if (sql.startsWith("SELECT v.version AS version, v.soul AS soul, v.brief_fields")) {
      const listing = world.listings.find((entry) => entry.id === text(params, 0));
      if (listing === undefined) {
        return null;
      }
      const version = world.versions.find(
        (entry) => entry.listingId === listing.id && entry.version === listing.version,
      );
      return version === undefined
        ? null
        : {
            version: version.version,
            soul: version.soul,
            briefFields: version.briefFields,
            budgetMinor: version.budgetMinor,
            manifest: version.manifest,
          };
    }
    if (sql.startsWith("SELECT v.version AS version, v.soul AS soul, v.manifest AS manifest")) {
      const listing = world.listings.find((entry) => entry.id === text(params, 0));
      if (listing === undefined) {
        return null;
      }
      const version = world.versions.find(
        (entry) => entry.listingId === listing.id && entry.version === listing.version,
      );
      return version === undefined
        ? null
        : {
            version: version.version,
            soul: version.soul,
            manifest: version.manifest,
          };
    }
    if (sql.startsWith("SELECT v.manifest AS manifest, v.soul AS soul FROM agent_listings l JOIN")) {
      const listing = world.listings.find((entry) => entry.id === text(params, 0));
      if (listing === undefined) {
        return null;
      }
      const version = world.versions.find(
        (entry) => entry.listingId === listing.id && entry.version === listing.version,
      );
      return version === undefined
        ? null
        : { manifest: version.manifest, soul: version.soul };
    }
    if (sql.startsWith("SELECT v.manifest AS manifest, v.soul AS soul, l.current_version AS version")) {
      const listing = world.listings.find((entry) => entry.id === text(params, 0));
      if (listing === undefined) {
        return null;
      }
      const version = world.versions.find(
        (entry) => entry.listingId === listing.id && entry.version === listing.version,
      );
      return version === undefined
        ? null
        : {
            manifest: version.manifest,
            soul: version.soul,
            version: version.version,
          };
    }
    if (sql.startsWith("SELECT ok AS ok, ran_at AS ranAt, detail AS detail")) {
      const found = world.kitRuns
        .filter(
          (run) => run.listingId === text(params, 0) && run.version === Number(params?.[1] ?? 0),
        )
        .sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))
        .at(0);
      return found === undefined
        ? null
        : {
            ok: found.ok,
            ranAt: found.ranAt,
            detail: found.detail,
            cardHash: found.cardHash ?? "",
          };
    }
    if (sql.startsWith("SELECT version AS version, sha256 AS sha256 FROM bundle_versions")) {
      const found = world.bundles.find(
        (bundle) => bundle.bundleId === text(params, 0) && bundle.status === "published",
      );
      return found === undefined
        ? null
        : { version: found.version, sha256: found.sha256 };
    }
    if (sql.startsWith("SELECT id AS id FROM desktop_bundles WHERE id = ?")) {
      const found = world.desktopBundles.find((bundle) => bundle.id === text(params, 0));
      return found === undefined ? null : { id: found.id };
    }
    if (sql.startsWith("SELECT p.kyc_tier AS kycTier")) {
      const account = world.payoutAccounts.at(0);
      return {
        ...(world.profile ?? {}),
        psp: account === undefined ? null : "paystack",
        subaccount: account === undefined ? null : "acct_1",
        currency: account === undefined ? null : account.currency,
        status: account === undefined ? null : account.status,
      };
    }
    if (sql.startsWith("SELECT COALESCE(SUM(gross_minor), 0)")) {
      const month = text(params, 1);
      const rows = world.splits.filter(
        (split) => split.authorId === text(params, 0) && split.createdAt.slice(0, 7) === month,
      );
      return {
        grossMinor: rows.reduce((sum, row) => sum + row.grossMinor, 0),
        commissionMinor: rows.reduce((sum, row) => sum + row.commissionMinor, 0),
        netMinor: rows.reduce((sum, row) => sum + row.netMinor, 0),
      };
    }
    if (sql.startsWith("SELECT COALESCE((SELECT currency FROM payout_accounts")) {
      const account = world.payoutAccounts.at(0);
      return { currency: account === undefined ? "NGN" : account.currency };
    }
    if (sql.startsWith("SELECT period AS period")) {
      return null;
    }
    return null;
  };

  const db: DatabaseImpl = {
    all: (sql, params) => {
      if (sql.startsWith("SELECT period AS period")) {
        return Effect.succeed(
          world.instructions.filter((row) => String(row.authorId) === text(params, 0)),
        );
      }
      return Effect.succeed([]);
    },
    first: (sql, params) => Effect.succeed(first(String(sql), params)),
    run: (sql, params) => {
      const bound = params ?? [];
      writes.push({ sql: String(sql), params: bound });
      if (sql.startsWith("INSERT INTO agent_listings")) {
        world.listings.push({
          id: text(bound, 0),
          ownerId: text(bound, 1),
          slug: text(bound, 2),
          name: text(bound, 3),
          tagline: text(bound, 4),
          category: text(bound, 5),
          status: "draft",
          priceMinor: Number(bound[6]),
          version: 1,
        });
      }
      if (sql.startsWith("INSERT INTO listing_versions")) {
        const create = sql.includes("VALUES (?, ?, 1,");
        world.versions.push({
          listingId: text(bound, 1),
          version: create ? 1 : Number(bound[2]),
          soul: text(bound, create ? 3 : 4),
          manifest: text(bound, create ? 4 : 5),
          briefFields: text(bound, create ? 5 : 6),
          budgetMinor: Number(bound[create ? 8 : 9]),
        });
      }
      if (sql.startsWith("UPDATE listing_versions SET soul")) {
        const listingId = text(bound, 5);
        const version = Number(bound[6]);
        const index = world.versions.findIndex(
          (entry) => entry.listingId === listingId && entry.version === version,
        );
        if (index >= 0) {
          world.versions[index] = {
            listingId,
            version,
            soul: text(bound, 0),
            manifest: text(bound, 1),
            briefFields: text(bound, 2),
            budgetMinor: Number(bound[4]),
          };
        }
      }
      if (sql.startsWith("INSERT INTO kit_runs")) {
        world.kitRuns.push({
          listingId: text(bound, 1),
          version: Number(bound[5]),
          ok: Number(bound[2]),
          ranAt: text(bound, 4),
          detail: text(bound, 3),
          cardHash: text(bound, 6),
        });
      }
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };

  return { db, writes };
};
