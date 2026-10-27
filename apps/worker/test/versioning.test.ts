import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { validateManifest } from "../src/listings/manifest.ts";
import { reviseListing } from "../src/studio/studio.ts";

const fakeDb = (
  rows: ReadonlyArray<{ prefix: string; row: Row | null }>,
): { db: DatabaseImpl; writes: Array<{ sql: string; params: ReadonlyArray<Param> }> } => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const find = (sql: string) => rows.find((entry) => sql.startsWith(entry.prefix));
  return {
    db: {
      all: () => Effect.succeed([]),
      first: (sql) => Effect.succeed(find(String(sql))?.row ?? null),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    },
    writes,
  };
};

const published = {
  id: "l1",
  slug: "cellar",
  name: "Cellar",
  tagline: "keeps the notes",
  category: "data",
  status: "published",
  priceMinor: 5000,
  version: 3,
};

const input = {
  name: "Cellar",
  tagline: "keeps the notes",
  category: "data",
  priceMinor: 6000,
  budgetMinor: 1000,
  briefFields: ["task"],
  soul: "you are cellar",
};

describe("revising a published listing", () => {
  it("opens version n+1 as a draft and leaves the live version untouched", async () => {
    const { db, writes } = fakeDb([{ prefix: "SELECT id AS id, slug", row: published }]);
    const result = await Effect.runPromise(reviseListing(db, "u1", "l1", input));
    expect(result.version).toBe(4);
    const insert = writes.find((w) => w.sql.includes("INSERT INTO listing_versions"));
    expect(insert).toBeDefined();
    expect(insert!.params[2]).toBe(4);
    expect(insert!.sql).toContain("'draft'");
    const rewrite = writes.find((w) => w.sql.startsWith("UPDATE listing_versions SET soul"));
    expect(rewrite).toBeUndefined();
  });

  it("refuses to revise a listing that is not live", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT id AS id, slug", row: { ...published, status: "draft" } },
    ]);
    const exit = await Effect.runPromiseExit(reviseListing(db, "u1", "l1", input));
    expect(exit._tag).toBe("Failure");
  });
});

<<<<<<< HEAD
describe("a revision can go back through review", () => {
  it("a published listing still publishes its approved revision and moves the pointer", async () => {
    const { db, writes } = (() => {
      const rows = [
        { prefix: "SELECT id AS id, slug", row: published },
      ] as const;
      const writes: Array<{ sql: string; params: ReadonlyArray<unknown> }> = [];
      const db: DatabaseImpl = {
        all: () => Effect.succeed([]),
        first: (sql: string) =>
          Effect.succeed(rows.find((r) => String(sql).startsWith(r.prefix))?.row ?? null),
        run: (sql: string, params?: ReadonlyArray<unknown>) => {
          writes.push({ sql: String(sql), params: params ?? [] });
          return Effect.void;
        },
        batch: () => Effect.void,
        changed: () => Effect.succeed(0),
      };
      return { db, writes };
    })();
    const result = await Effect.runPromise(reviseListing(db, "u1", "l1", input));
    expect(result.version).toBe(4);
    expect(writes.some((w) => w.sql.includes("INSERT INTO listing_versions"))).toBe(true);
=======
describe("manifest v2 lanes", () => {
  const authored = {
    schema: 2,
    soul: "x",
    runtime: { kind: "authored", billing: "platform-metered", transport: ["web"] },
  };
  const hosted = {
    schema: 2,
    soul: "x",
    runtime: {
      kind: "hosted",
      billing: "author-metered",
      transport: ["web"],
      hosted: { mode: "push", cardUrl: "https://a.dev/.well-known/agent-card.json" },
    },
    report: { requireEvidence: true, minEvidence: 1 },
    data: { retentionDays: 30, leavesCountry: true, dpia: true },
  };
  const desktop = {
    schema: 2,
    soul: "x",
    runtime: {
      kind: "desktop",
      billing: "author-metered",
      transport: ["desktop"],
      desktop: {
        bundleId: "clicky",
        entrypoint: "clicky.exe",
        dataDirs: ["%LOCALAPPDATA%/klawva/clicky"],
        platforms: ["windows"],
        network: ["api.clicky.dev"],
        capabilities: { screen: "read", input: ["click", "type"] },
      },
    },
    report: { requireEvidence: true, minEvidence: 1 },
    data: { retentionDays: 30, leavesCountry: false, dpia: true },
  };

  it("accepts the three lanes", () => {
    expect(validateManifest(authored as never).ok).toBe(true);
    expect(validateManifest(hosted as never).ok).toBe(true);
    expect(validateManifest(desktop as never).ok).toBe(true);
  });

  it("refuses an authored listing claiming a hosted block", () => {
    const verdict = validateManifest({ ...authored, runtime: { ...authored.runtime, hosted: { mode: "push", cardUrl: "https://a.dev" } } } as never);
    expect(verdict.ok).toBe(false);
  });

  it("hosted v1 is web only", () => {
    const verdict = validateManifest({ ...hosted, runtime: { ...hosted.runtime, transport: ["phone"] } } as never);
    expect(verdict.ok).toBe(false);
  });

  it("refuses an http card url", () => {
    const verdict = validateManifest({
      ...hosted,
      runtime: { ...hosted.runtime, hosted: { mode: "push", cardUrl: "http://a.dev/card" } },
    } as never);
    expect(verdict.ok).toBe(false);
  });

  it("desktop requires windows at launch and non-empty data dirs", () => {
    const noWindows = {
      ...desktop,
      runtime: { ...desktop.runtime, desktop: { ...desktop.runtime.desktop, platforms: ["linux"] } },
    };
    const emptyDirs = {
      ...desktop,
      runtime: { ...desktop.runtime, desktop: { ...desktop.runtime.desktop, dataDirs: [] } },
    };
    expect(validateManifest(noWindows as never).ok).toBe(false);
    expect(validateManifest(emptyDirs as never).ok).toBe(false);
  });

  it("refuses widened limits", () => {
    const verdict = validateManifest({
      ...hosted,
      limits: {
        maxWallClockSeconds: 999_999,
        maxEvents: 10,
        maxEventBytes: 100,
        maxArtifactBytes: 100,
        minIdleSeconds: 30,
      },
    } as never);
    expect(verdict.ok).toBe(false);
  });

  it("third-party lanes must demand evidence", () => {
    const verdict = validateManifest({ ...hosted, report: { requireEvidence: false, minEvidence: 0 } } as never);
    expect(verdict.ok).toBe(false);
  });

  it("refuses an unknown key", () => {
    const verdict = validateManifest({ ...hosted, smuggled: true } as never);
    expect(verdict.ok).toBe(false);
>>>>>>> ca2d2b2 (feat(marketplace): the author data schedule in product form)
  });

  it("third-party lanes need a data policy with a dpia", () => {
    const noData = { ...hosted, data: undefined };
    const noDpia = { ...hosted, data: { retentionDays: 30, leavesCountry: true, dpia: false } };
    const tooLong = { ...hosted, data: { retentionDays: 400, leavesCountry: true, dpia: true } };
    expect(validateManifest(noData as never).ok).toBe(false);
    expect(validateManifest(noDpia as never).ok).toBe(false);
    expect(validateManifest(tooLong as never).ok).toBe(false);
  });

  it("authored listings do not need a data policy", () => {
    expect(validateManifest(authored as never).ok).toBe(true);
  });
});

describe("manifest v2 lanes", () => {
  const authored = {
    schema: 2,
    soul: "x",
    runtime: { kind: "authored", billing: "platform-metered", transport: ["web"] },
  };
  const hosted = {
    schema: 2,
    soul: "x",
    runtime: {
      kind: "hosted",
      billing: "author-metered",
      transport: ["web"],
      hosted: { mode: "push", cardUrl: "https://a.dev/.well-known/agent-card.json" },
    },
    report: { requireEvidence: true, minEvidence: 1 },
    data: { retentionDays: 30, leavesCountry: true, dpia: true },
  };
  const desktop = {
    schema: 2,
    soul: "x",
    runtime: {
      kind: "desktop",
      billing: "author-metered",
      transport: ["desktop"],
      desktop: {
        bundleId: "clicky",
        entrypoint: "clicky.exe",
        dataDirs: ["%LOCALAPPDATA%/klawva/clicky"],
        platforms: ["windows"],
        network: ["api.clicky.dev"],
        capabilities: { screen: "read", input: ["click", "type"] },
      },
    },
    report: { requireEvidence: true, minEvidence: 1 },
    data: { retentionDays: 30, leavesCountry: false, dpia: true },
  };

  it("accepts the three lanes", () => {
    expect(validateManifest(authored as never).ok).toBe(true);
    expect(validateManifest(hosted as never).ok).toBe(true);
    expect(validateManifest(desktop as never).ok).toBe(true);
  });

  it("refuses an authored listing claiming a hosted block", () => {
    const verdict = validateManifest({ ...authored, runtime: { ...authored.runtime, hosted: { mode: "push", cardUrl: "https://a.dev" } } } as never);
    expect(verdict.ok).toBe(false);
  });

  it("hosted v1 is web only", () => {
    const verdict = validateManifest({ ...hosted, runtime: { ...hosted.runtime, transport: ["phone"] } } as never);
    expect(verdict.ok).toBe(false);
  });

  it("refuses an http card url", () => {
    const verdict = validateManifest({
      ...hosted,
      runtime: { ...hosted.runtime, hosted: { mode: "push", cardUrl: "http://a.dev/card" } },
    } as never);
    expect(verdict.ok).toBe(false);
  });

  it("desktop requires windows at launch and non-empty data dirs", () => {
    const noWindows = {
      ...desktop,
      runtime: { ...desktop.runtime, desktop: { ...desktop.runtime.desktop, platforms: ["linux"] } },
    };
    const emptyDirs = {
      ...desktop,
      runtime: { ...desktop.runtime, desktop: { ...desktop.runtime.desktop, dataDirs: [] } },
    };
    expect(validateManifest(noWindows as never).ok).toBe(false);
    expect(validateManifest(emptyDirs as never).ok).toBe(false);
  });

  it("refuses widened limits", () => {
    const verdict = validateManifest({
      ...hosted,
      limits: {
        maxWallClockSeconds: 999_999,
        maxEvents: 10,
        maxEventBytes: 100,
        maxArtifactBytes: 100,
        minIdleSeconds: 30,
      },
    } as never);
    expect(verdict.ok).toBe(false);
  });

  it("third-party lanes must demand evidence", () => {
    const verdict = validateManifest({ ...hosted, report: { requireEvidence: false, minEvidence: 0 } } as never);
    expect(verdict.ok).toBe(false);
  });

  it("refuses an unknown key", () => {
    const verdict = validateManifest({ ...hosted, smuggled: true } as never);
    expect(verdict.ok).toBe(false);
  });

  it("third-party lanes need a data policy with a dpia", () => {
    const noData = { ...hosted, data: undefined };
    const noDpia = { ...hosted, data: { retentionDays: 30, leavesCountry: true, dpia: false } };
    const tooLong = { ...hosted, data: { retentionDays: 400, leavesCountry: true, dpia: true } };
    expect(validateManifest(noData as never).ok).toBe(false);
    expect(validateManifest(noDpia as never).ok).toBe(false);
    expect(validateManifest(tooLong as never).ok).toBe(false);
  });

  it("authored listings do not need a data policy", () => {
    expect(validateManifest(authored as never).ok).toBe(true);
  });
});
