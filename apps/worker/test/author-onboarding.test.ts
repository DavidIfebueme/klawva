import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { AgentRuntimeImpl } from "../src/agent/runtime.ts";
import { ManifestJson } from "../src/db/schema.ts";
import { capabilitySheet } from "../src/listings/capabilities.ts";
import {
  manifestForLane,
  validateManifest,
  type LaneDraft,
} from "../src/listings/manifest.ts";
import {
  authorEarnings,
  authorLimits,
  linkAuthorPayout,
  payoutOverview,
  type LinkPayoutInput,
} from "../src/studio/money.ts";
import {
  createAuthorDraft,
  deleteAuthorListing,
  listingDetail,
  runAuthorKit,
  submit,
  submitBlockedReason,
  updateAuthorDraft,
  withdrawListing,
  type DraftInput,
  type UpdateInput,
} from "../src/studio/studio.ts";
import { hashToken } from "../src/hosted/tokens.ts";
import { emptyWorld, fakeDb } from "./author-db.ts";

const CARD_HASH = await Effect.runPromise(hashToken("https://clicky.dev/card"));

const base: DraftInput = {
  slug: "clicky",
  name: "Clicky",
  tagline: "clicks things",
  category: "ops",
  priceMinor: 5_000,
  budgetMinor: 1_000,
  briefFields: ["task"],
  soul: "you are clicky",
};

const hostedInput: DraftInput = {
  ...base,
  lane: "hosted",
  hosted: {
    cardUrl: "https://clicky.dev/.well-known/agent-card.json",
    mode: "push",
  },
  data: { retentionDays: 30, leavesCountry: true, dpia: true },
};

const desktopBlock: NonNullable<DraftInput["desktop"]> = {
  bundleId: "clicky",
  entrypoint: "clicky.exe",
  dataDirs: ["%LOCALAPPDATA%/clicky"],
  capabilities: {
    screen: "read",
    input: ["click", "type"],
    network: ["api.clicky.dev"],
    fs: ["workspace"],
  },
};

const desktopInput: DraftInput = {
  ...base,
  lane: "desktop",
  desktop: desktopBlock,
  data: { retentionDays: 30, leavesCountry: false, dpia: true },
};

const ManifestView = Schema.Struct({
  kind: Schema.String,
  billing: Schema.String,
  transport: Schema.Array(Schema.String),
  hosted: Schema.NullOr(
    Schema.Struct({ cardUrl: Schema.String, mode: Schema.String }),
  ),
  desktop: Schema.NullOr(
    Schema.Struct({
      bundleId: Schema.String,
      entrypoint: Schema.String,
      dataDirs: Schema.Array(Schema.String),
      capabilities: Schema.Struct({
        screen: Schema.optional(Schema.Literals(["read"])),
        input: Schema.Array(Schema.String),
        network: Schema.Array(Schema.String),
        fs: Schema.Array(Schema.String),
      }),
    }),
  ),
  limits: Schema.NullOr(Schema.Struct({ maxEvents: Schema.Number })),
  data: Schema.NullOr(
    Schema.Struct({
      retentionDays: Schema.Number,
      leavesCountry: Schema.Boolean,
      dpia: Schema.Boolean,
    }),
  ),
  launchMarkets: Schema.Array(Schema.String),
});

const DetailView = Schema.Struct({
  lane: Schema.String,
  manifest: ManifestView,
  kit: Schema.Struct({
    ranAt: Schema.NullOr(Schema.String),
    ok: Schema.Boolean,
    steps: Schema.Array(
      Schema.Struct({
        step: Schema.String,
        ok: Schema.Boolean,
        detail: Schema.String,
      }),
    ),
  }),
  bundle: Schema.Struct({
    version: Schema.NullOr(Schema.String),
    sha256: Schema.NullOr(Schema.String),
  }),
  canSubmit: Schema.Boolean,
  submitBlockedReason: Schema.NullOr(Schema.String),
});

const readDetail = (row: unknown) => Schema.decodeUnknownSync(DetailView)(row);

const roundTrip = async (input: DraftInput) => {
  const world = emptyWorld();
  const { db } = fakeDb(world);
  const id = await Effect.runPromise(createAuthorDraft(db, "u1", input));
  const detail = await Effect.runPromise(listingDetail(db, "u1", id));
  const stored = world.versions.find((entry) => entry.listingId === id);
  if (stored === undefined) {
    throw new Error("version_missing");
  }
  return {
    detail: readDetail(detail),
    stored: Schema.decodeUnknownSync(ManifestJson)(stored.manifest),
  };
};

describe("lanes in the draft path", () => {
  it("round-trips an authored listing without a runtime block", async () => {
    const { detail, stored } = await roundTrip(base);
    expect(detail.lane).toBe("authored");
    expect(detail.manifest.kind).toBe("authored");
    expect(detail.manifest.hosted).toBeNull();
    expect(detail.manifest.desktop).toBeNull();
    expect(detail.manifest.data).toBeNull();
    expect(stored.runtime).toBeUndefined();
    expect(stored.report).toBeUndefined();
    expect(stored.data).toBeUndefined();
    expect(stored.schema).toBe(2);
  });

  it("round-trips a hosted listing with its card and data policy", async () => {
    const { detail, stored } = await roundTrip(hostedInput);
    expect(detail.lane).toBe("hosted");
    expect(detail.manifest.kind).toBe("hosted");
    expect(detail.manifest.billing).toBe("author-metered");
    expect(detail.manifest.transport).toEqual(["web"]);
    expect(detail.manifest.hosted).toEqual({
      cardUrl: "https://clicky.dev/.well-known/agent-card.json",
      mode: "push",
    });
    expect(stored.report).toEqual({ requireEvidence: true, minEvidence: 1 });
    expect(stored.data).toEqual({
      retentionDays: 30,
      leavesCountry: true,
      dpia: true,
    });
    expect(detail.kit.ranAt).toBeNull();
  });

  it("round-trips a desktop listing with its capabilities and limits", async () => {
    const { detail, stored } = await roundTrip(desktopInput);
    expect(detail.lane).toBe("desktop");
    expect(detail.manifest.kind).toBe("desktop");
    expect(detail.manifest.transport).toEqual(["desktop"]);
    expect(detail.manifest.desktop?.bundleId).toBe("clicky");
    expect(detail.manifest.desktop?.capabilities.screen).toBe("read");
    expect(detail.manifest.desktop?.capabilities.network).toEqual([
      "api.clicky.dev",
    ]);
    expect(detail.bundle).toEqual({ version: null, sha256: null });
    expect(stored.limits?.maxEvents).toBe(500);
    expect(stored.runtime?.desktop?.platforms).toEqual(["windows"]);
  });

  it("keeps a launch market when the draft names one", async () => {
    const { detail } = await roundTrip({ ...base, launchMarkets: ["ng"] });
    expect(detail.manifest.launchMarkets).toEqual(["ng"]);
  });
});

describe("slug format", () => {
  it("refuses a slug with a space", async () => {
    const { db } = fakeDb(emptyWorld());
    const error = await Effect.runPromise(
      Effect.flip(createAuthorDraft(db, "u1", { ...base, slug: "test support desk" })),
    );
    expect(error._tag).toBe("ListingConflict");
    if (error._tag === "ListingConflict") {
      expect(error.reason).toBe("slug_format");
    }
  });

  it("refuses an uppercase slug and a trailing dash", async () => {
    const { db } = fakeDb(emptyWorld());
    const upper = await Effect.runPromise(
      Effect.flip(createAuthorDraft(db, "u1", { ...base, slug: "Ada-Desk" })),
    );
    const trailing = await Effect.runPromise(
      Effect.flip(createAuthorDraft(db, "u1", { ...base, slug: "ada-desk-" })),
    );
    expect(upper._tag === "ListingConflict" && upper.reason).toBe("slug_format");
    expect(trailing._tag === "ListingConflict" && trailing.reason).toBe("slug_format");
  });

  it("refuses a slug outside the length window", async () => {
    const { db } = fakeDb(emptyWorld());
    const error = await Effect.runPromise(
      Effect.flip(createAuthorDraft(db, "u1", { ...base, slug: "a" })),
    );
    expect(error._tag === "ListingConflict" && error.reason).toBe("slug_length");
  });
});

describe("manifest refusals at create", () => {
  const reasonFor = async (input: DraftInput): Promise<string> => {
    const { db } = fakeDb(emptyWorld());
    const error = await Effect.runPromise(
      Effect.flip(createAuthorDraft(db, "u1", input)),
    );
    return error.reason;
  };

  const hostedManifest = (() => {
    const built = manifestForLane({
      soul: "x",
      lane: "hosted",
      hosted: { cardUrl: "https://a.dev/card", mode: "push" },
      data: { retentionDays: 30, leavesCountry: true, dpia: true },
    } satisfies LaneDraft);
    if (!built.ok) {
      throw new Error("fixture_invalid");
    }
    return built.manifest;
  })();

  it("refuses a widened limit", async () => {
    expect(await reasonFor({ ...hostedInput, limits: { maxEvents: 501 } })).toBe(
      "manifest:limit_widened:maxEvents",
    );
  });

  it("refuses an unknown key", () => {
    const verdict = validateManifest(
      Object.assign({}, hostedManifest, { smuggled: true }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reasons).toContain("unknown_key:smuggled");
    }
  });

  it("refuses an http card url", async () => {
    const reason = await reasonFor({
      ...hostedInput,
      hosted: { cardUrl: "http://clicky.dev/card", mode: "push" },
    });
    expect(reason).toBe("manifest:hosted_card_url_not_https");
  });

  it("refuses a hosted listing with no usable card url", async () => {
    const reason = await reasonFor({
      ...hostedInput,
      hosted: { cardUrl: "", mode: "push" },
    });
    expect(reason).toBe("manifest:hosted_card_url_not_https");
  });

  it("refuses an authored listing that claims a desktop block", async () => {
    const reason = await reasonFor({
      ...base,
      desktop: desktopInput.desktop,
    });
    expect(reason).toBe("manifest:authored_with_desktop_block");
  });

  it("refuses a desktop bundle that does not target windows", async () => {
    const reason = await reasonFor({
      ...desktopInput,
      desktop: {
        ...desktopBlock,
        platforms: ["linux"],
      },
    });
    expect(reason).toContain("desktop_v1_requires_windows");
  });

  it("refuses a third-party listing without an evidence policy", () => {
    const verdict = validateManifest({
      ...hostedManifest,
      report: { requireEvidence: false, minEvidence: 0 },
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reasons).toContain("evidence_required_for_third_party");
    }
  });

  it("refuses a retention window over a year", async () => {
    const reason = await reasonFor({
      ...hostedInput,
      data: { retentionDays: 400, leavesCountry: true, dpia: true },
    });
    expect(reason).toBe("manifest:retention_too_long");
  });
});

describe("create guards the tier cap", () => {
  it("refuses a third listing for a tier 0 author with two already", async () => {
    const world = {
      ...emptyWorld(),
      listings: [1, 2].map((index) => ({
        id: `l${index}`,
        ownerId: "u1",
        slug: `l${index}`,
        name: "x",
        tagline: "x",
        category: "x",
        status: "draft",
        priceMinor: 100,
        version: 1,
      })),
    };
    const { db } = fakeDb(world);
    const error = await Effect.runPromise(
      Effect.flip(createAuthorDraft(db, "u1", base)),
    );
    expect(error.reason).toBe("listing_cap_reached");
  });

  it("treats a missing profile as tier 0", async () => {
    const { db } = fakeDb(emptyWorld());
    const id = await Effect.runPromise(createAuthorDraft(db, "u1", base));
    expect(id.length).toBeGreaterThan(0);
  });
});

describe("editing a listing keeps its lane", () => {
  it("keeps the hosted block when the payload does not name a lane", async () => {
    const { db } = fakeDb(emptyWorld());
    const id = await Effect.runPromise(
      createAuthorDraft(db, "u1", {
        ...base,
        lane: "hosted",
        hosted: { cardUrl: "https://clicky.dev/card", mode: "push" },
        data: { retentionDays: 30, leavesCountry: true, dpia: true },
      }),
    );
    const patch: UpdateInput = {
      name: "Clicky",
      tagline: "clicks things",
      category: "ops",
      priceMinor: 5_000,
      budgetMinor: 1_000,
      briefFields: ["task"],
      soul: "you are clicky, edited",
    };
    await Effect.runPromise(updateAuthorDraft(db, "u1", id, patch));
    const detail = await Effect.runPromise(listingDetail(db, "u1", id));
    expect(detail?.lane).toBe("hosted");
    const manifest = Schema.decodeUnknownSync(
      Schema.Struct({
        kind: Schema.String,
        hosted: Schema.NullOr(Schema.Struct({ cardUrl: Schema.String })),
      }),
    )(detail?.manifest);
    expect(manifest.kind).toBe("hosted");
    expect(manifest.hosted?.cardUrl).toBe("https://clicky.dev/card");
  });
});

describe("an author can clear a listing", () => {
  it("deletes a draft and its versions", async () => {
    const { db } = fakeDb(emptyWorld());
    const id = await Effect.runPromise(createAuthorDraft(db, "u1", base));
    await Effect.runPromise(deleteAuthorListing(db, "u1", id));
    const detail = await Effect.runPromise(listingDetail(db, "u1", id));
    expect(detail).toBeNull();
  });

  it("refuses to delete a published listing", async () => {
    const world = {
      ...emptyWorld(),
      listings: [
        {
          id: "l1",
          ownerId: "u1",
          slug: "clicky",
          name: "Clicky",
          tagline: "x",
          category: "ops",
          status: "published",
          priceMinor: 5_000,
          version: 1,
        },
      ],
      versions: [
        {
          listingId: "l1",
          version: 1,
          soul: "x",
          manifest: JSON.stringify({ soul: "x" }),
          briefFields: "[]",
          budgetMinor: 1_000,
        },
      ],
    };
    const { db } = fakeDb(world);
    const error = await Effect.runPromise(
      Effect.flip(deleteAuthorListing(db, "u1", "l1")),
    );
    expect(error._tag === "ListingConflict" && error.reason).toBe(
      "not_deletable:published",
    );
  });

  it("withdraws a listing from review back to draft", async () => {
    const world = {
      ...emptyWorld(),
      listings: [
        {
          id: "l1",
          ownerId: "u1",
          slug: "clicky",
          name: "Clicky",
          tagline: "x",
          category: "ops",
          status: "in_review",
          priceMinor: 5_000,
          version: 1,
        },
      ],
    };
    const { db } = fakeDb(world);
    const result = await Effect.runPromise(withdrawListing(db, "u1", "l1"));
    expect(result.status).toBe("draft");
    expect(world.listings[0]?.status).toBe("draft");
  });

  it("refuses to withdraw a draft", async () => {
    const { db } = fakeDb({
      ...emptyWorld(),
      listings: [
        {
          id: "l1",
          ownerId: "u1",
          slug: "clicky",
          name: "Clicky",
          tagline: "x",
          category: "ops",
          status: "draft",
          priceMinor: 5_000,
          version: 1,
        },
      ],
    });
    const error = await Effect.runPromise(Effect.flip(withdrawListing(db, "u1", "l1")));
    expect(error._tag === "ListingConflict" && error.reason).toBe(
      "not_withdrawable:draft",
    );
  });
});

describe("submit gate", () => {
  const now = new Date().toISOString();
  const hostedWorld = (kitOk: number | null) => {
    const built = manifestForLane({
      soul: "you are clicky",
      lane: "hosted",
      hosted: { cardUrl: "https://clicky.dev/card", mode: "push" },
      data: { retentionDays: 30, leavesCountry: true, dpia: true },
    } satisfies LaneDraft);
    if (!built.ok) {
      throw new Error("fixture_invalid");
    }
    return {
      ...emptyWorld(),
      profile: { kycTier: 1, displayName: "Test Author" },
      listings: [
        {
          id: "l1",
          ownerId: "u1",
          slug: "clicky",
          name: "Clicky",
          tagline: "x",
          category: "ops",
          status: "draft",
          priceMinor: 5_000,
          version: 1,
        },
      ],
      versions: [
        {
          listingId: "l1",
          version: 1,
          soul: "you are clicky",
          manifest: JSON.stringify(built.manifest),
          briefFields: "[]",
          budgetMinor: 1_000,
        },
      ],
      kitRuns:
        kitOk === null
          ? []
          : [
              {
                listingId: "l1",
                version: 1,
                ok: kitOk,
                ranAt: now,
                cardHash: CARD_HASH,
                detail: JSON.stringify([
                  { step: "card", ok: kitOk === 1, detail: "http_200" },
                ]),
              },
            ],
    };
  };

  const runtime: AgentRuntimeImpl = {
    complete: () =>
      Effect.succeed({
        text: "I read the card and answer the task with evidence.",
        toolCalls: [],
        usage: { inTokens: 10, outTokens: 10 },
      }),
  };

  it("refuses a hosted listing with no green kit run", async () => {
    const { db } = fakeDb(hostedWorld(null));
    const error = await Effect.runPromise(
      Effect.flip(submit(db, runtime, "u1", "l1")),
    );
    expect(error._tag).toBe("ListingConflict");
    if (error._tag === "ListingConflict") {
      expect(error.reason).toBe("kit_not_green");
    }
  });

  it("accepts a hosted listing once the kit is green", async () => {
    const { db } = fakeDb(hostedWorld(1));
    const outcome = await Effect.runPromise(submit(db, runtime, "u1", "l1"));
    expect(outcome.status.length).toBeGreaterThan(0);
  });

  it("refuses a desktop listing with no published bundle", async () => {
    const built = manifestForLane({
      soul: "you are clicky",
      lane: "desktop",
      desktop: {
        bundleId: "clicky",
        entrypoint: "clicky.exe",
        dataDirs: ["%LOCALAPPDATA%/clicky"],
        capabilities: {},
      },
      data: { retentionDays: 30, leavesCountry: false, dpia: true },
    } satisfies LaneDraft);
    if (!built.ok) {
      throw new Error("fixture_invalid");
    }
    const { db } = fakeDb({
      ...emptyWorld(),
      profile: { kycTier: 1, displayName: "Test Author" },
      listings: [
        {
          id: "l1",
          ownerId: "u1",
          slug: "clicky",
          name: "Clicky",
          tagline: "x",
          category: "ops",
          status: "draft",
          priceMinor: 5_000,
          version: 1,
        },
      ],
    });
    const blocked = await Effect.runPromise(
      submitBlockedReason(db, "l1", 1, "draft", built.manifest),
    );
    expect(blocked).toBe("bundle_missing");
  });
});

describe("kit runs for an author", () => {
  it("refuses a kit on a non-hosted listing", async () => {
    const world = emptyWorld();
    const { db } = fakeDb(world);
    const id = await Effect.runPromise(createAuthorDraft(db, "u1", base));
    const error = await Effect.runPromise(
      Effect.flip(runAuthorKit(db, "u1", id)),
    );
    expect(error._tag).toBe("ListingConflict");
    if (error._tag === "ListingConflict") {
      expect(error.reason).toBe("not_hosted");
    }
  });

  it("refuses past ten runs in a day", async () => {
    const world = emptyWorld();
    const { db } = fakeDb(world);
    const id = await Effect.runPromise(createAuthorDraft(db, "u1", hostedInput));
    for (let index = 0; index < 10; index++) {
      world.kitRuns.push({
        listingId: id,
        version: 1,
        ok: 0,
        ranAt: new Date().toISOString(),
        detail: "[]",
      });
    }
    const error = await Effect.runPromise(
      Effect.flip(runAuthorKit(db, "u1", id)),
    );
    expect(error._tag).toBe("ListingConflict");
    if (error._tag === "ListingConflict") {
      expect(error.reason).toBe("kit_cap_reached");
    }
  });
});

describe("author money surface", () => {
  it("rejects a payout link without accepted terms", async () => {
    const { db } = fakeDb(emptyWorld());
    const input: LinkPayoutInput = {
      psp: "paystack",
      subaccount: "acct_1",
      country: "NG",
      currency: "NGN",
      tin: "123",
      acceptTerms: false,
    };
    const error = await Effect.runPromise(
      Effect.flip(linkAuthorPayout(db, "u1", input)),
    );
    expect(error.reason).toBe("author_terms_not_accepted");
  });

  it("rejects a payout link without a tin", async () => {
    const { db } = fakeDb(emptyWorld());
    const error = await Effect.runPromise(
      Effect.flip(
        linkAuthorPayout(db, "u1", {
          psp: "flutterwave",
          subaccount: "acct_1",
          country: "NG",
          currency: "NGN",
          tin: "  ",
          acceptTerms: true,
        }),
      ),
    );
    expect(error.reason).toBe("tin_required");
  });

  it("accepts a valid payout link", async () => {
    const { db, writes } = fakeDb(emptyWorld());
    const outcome = await Effect.runPromise(
      linkAuthorPayout(db, "u1", {
        psp: "paystack",
        subaccount: "acct_1",
        country: "NG",
        currency: "NGN",
        tin: "123",
        acceptTerms: true,
      }),
    );
    expect(outcome.ok).toBe(true);
    expect(
      writes.some((write) => write.sql.startsWith("INSERT INTO payout_accounts")),
    ).toBe(true);
  });

  it("returns pending earnings and the newest instructions", async () => {
    const month = new Date().toISOString().slice(0, 7);
    const world = {
      ...emptyWorld(),
      profile: { kycTier: 1, country: "NG", tin: "123", displayName: "Test Author" },
      payoutAccounts: [{ currency: "NGN", status: "active" }],
      splits: [
        {
          authorId: "u1",
          grossMinor: 10_000,
          commissionMinor: 2_000,
          netMinor: 8_000,
          createdAt: `${month}-05T00:00:00.000Z`,
        },
        {
          authorId: "u1",
          grossMinor: 5_000,
          commissionMinor: 1_000,
          netMinor: 4_000,
          createdAt: `${month}-06T00:00:00.000Z`,
        },
      ],
      instructions: [
        {
          authorId: "u1",
          period: "2026-08",
          grossMinor: 9_000,
          commissionMinor: 1_800,
          whtMinor: 720,
          netMinor: 6_480,
          status: "sent",
          psp: "paystack",
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
    const { db } = fakeDb(world);
    const earnings = await Effect.runPromise(authorEarnings(db, "u1"));
    expect(earnings.currency).toBe("NGN");
    expect(earnings.pending).toEqual({
      grossMinor: 15_000,
      commissionMinor: 3_000,
      netMinor: 12_000,
    });
    expect(earnings.instructions).toHaveLength(1);
    expect(earnings.instructions[0]?.period).toBe("2026-08");
    expect(earnings.instructions[0]?.whtMinor).toBe(720);
  });

  it("returns zeros and no rows when there is no money yet", async () => {
    const { db } = fakeDb(emptyWorld());
    const earnings = await Effect.runPromise(authorEarnings(db, "u1"));
    expect(earnings.pending).toEqual({
      grossMinor: 0,
      commissionMinor: 0,
      netMinor: 0,
    });
    expect(earnings.instructions).toEqual([]);
    expect(earnings.currency).toBe("NGN");
  });

  it("reports the payout overview with nullable fields", async () => {
    const world = {
      ...emptyWorld(),
      profile: { kycTier: 1, country: "NG", tin: "123", displayName: "Test Author" },
      payoutAccounts: [{ currency: "NGN", status: "active" }],
    };
    const { db } = fakeDb(world);
    const overview = await Effect.runPromise(payoutOverview(db, "u1"));
    expect(overview.tier).toBe(1);
    expect(overview.psp).toBe("paystack");
    expect(overview.status).toBe("active");

    const bare = await Effect.runPromise(payoutOverview(fakeDb(emptyWorld()).db, "u1"));
    expect(bare.tier).toBe(0);
    expect(bare.psp).toBeNull();
  });

  it("reports the tier cap and the listings used", async () => {
    const world = {
      ...emptyWorld(),
      profile: { kycTier: 1, displayName: "Test Author" },
      listings: [
        {
          id: "l1",
          ownerId: "u1",
          slug: "a",
          name: "a",
          tagline: "a",
          category: "a",
          status: "draft",
          priceMinor: 100,
          version: 1,
        },
      ],
    };
    const { db } = fakeDb(world);
    const limits = await Effect.runPromise(authorLimits(db, "u1"));
    expect(limits).toEqual({ tier: 1, cap: 20, used: 1 });
  });
});

describe("capability sheet", () => {
  const sheetFor = (draft: LaneDraft): ReadonlyArray<string> => {
    const built = manifestForLane(draft);
    if (!built.ok) {
      throw new Error("fixture_invalid");
    }
    return capabilitySheet(built.manifest);
  };

  const desktopDraft: LaneDraft = {
    soul: "x",
    lane: "desktop",
    desktop: {
      bundleId: "clicky",
      entrypoint: "clicky.exe",
      dataDirs: ["%LOCALAPPDATA%/clicky"],
      capabilities: { screen: "read", input: ["click"], fs: ["workspace"] },
    },
    data: { retentionDays: 30, leavesCountry: false, dpia: true },
  };

  it("describes a desktop bundle that talks to the network", () => {
    const sheet = sheetFor({
      ...desktopDraft,
      desktop: {
        ...desktopDraft.desktop!,
        capabilities: {
          screen: "read",
          input: ["click"],
          network: ["api.clicky.dev", "cdn.clicky.dev"],
          fs: ["workspace"],
        },
      },
    });
    expect(sheet).toContain("reads what is on your screen");
    expect(sheet).toContain("can click and type for you");
    expect(sheet).toContain("sends data to api.clicky.dev, cdn.clicky.dev");
    expect(sheet).toContain("reads files only in the folder you pick");
    expect(sheet).toContain("stores its data in %LOCALAPPDATA%/clicky");
    expect(sheet).not.toContain("stays on your machine");
  });

  it("says a desktop bundle with no network declares no network access", () => {
    expect(sheetFor(desktopDraft)).toContain("declares no network access");
  });

  it("says hosted work runs on the author's server", () => {
    expect(
      sheetFor({
        soul: "x",
        lane: "hosted",
        hosted: { cardUrl: "https://a.dev/card", mode: "push" },
        data: { retentionDays: 30, leavesCountry: true, dpia: true },
      }),
    ).toEqual(["work runs on the author's server, not on klawva"]);
  });

  it("returns nothing for an authored listing", () => {
    expect(sheetFor({ soul: "x", lane: "authored" })).toEqual([]);
  });
});
