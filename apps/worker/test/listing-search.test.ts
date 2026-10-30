import { afterEach, describe, expect, it, vi } from "vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { DatabaseError, type DatabaseImpl, type Param, type Row } from "../src/db/database.ts";
import type { Env } from "../src/env.ts";
import { lexicalHits } from "../src/search/lexical.ts";
import { parseQuery } from "../src/search/query.ts";
import { searchCatalog } from "../src/search/search.ts";
import { semanticHits } from "../src/search/semantic.ts";
import { indexListing } from "../src/search/indexing.ts";
import { EMBED_DIMENSIONS, TITAN_MODEL } from "../src/search/embed.ts";

const encode = (values: ReadonlyArray<number>): string => {
  const bytes = new Uint8Array(Float32Array.from(values).buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
};

const unit = (axis: number): ReadonlyArray<number> => {
  const values = new Array<number>(EMBED_DIMENSIONS).fill(0);
  values[axis] = 1;
  return values;
};

const dbWith = (options: {
  readonly lexical?: ReadonlyArray<Row>;
  readonly allFallback?: ReadonlyArray<Row>;
  readonly embeddings?: ReadonlyArray<Row>;
  readonly listing?: Row | null;
  readonly existing?: Row | null;
}) => {
  const batches: Array<ReadonlyArray<{ sql: string; params?: ReadonlyArray<Param> }>> = [];
  const writes: Array<{ sql: string; params?: ReadonlyArray<Param> }> = [];
  const db: DatabaseImpl = {
    all: (sql: string) => {
      if (String(sql).includes("bm25")) {
        return Effect.succeed(options.lexical ?? []);
      }
      if (String(sql).includes("FROM listing_embeddings")) {
        return Effect.succeed(options.embeddings ?? []);
      }
      return Effect.succeed(options.allFallback ?? []);
    },
    first: (sql: string) => {
      if (String(sql).includes("SELECT l.name AS name")) {
        return Effect.succeed(options.listing ?? null);
      }
      if (String(sql).includes("SELECT text_hash AS textHash")) {
        return Effect.succeed(options.existing ?? null);
      }
      return Effect.succeed(null);
    },
    run: (sql: string, params?: ReadonlyArray<Param>) => {
      writes.push({ sql: String(sql), params });
      return Effect.void;
    },
    batch: (statements: ReadonlyArray<{ sql: string; params?: ReadonlyArray<Param> }>) => {
      batches.push(statements);
      return Effect.void;
    },
    changed: () => Effect.succeed(0),
  };
  return { db, batches, writes };
};

const partialDb = (over: Partial<DatabaseImpl>): DatabaseImpl => ({
  all: () => Effect.succeed([]),
  first: () => Effect.succeed(null),
  run: () => Effect.void,
  batch: () => Effect.void,
  changed: () => Effect.succeed(0),
  ...over,
});

const env = (over: Partial<Env> = {}): Env =>
  ({
    AWS_BEDROCK_API_KEY: "ABSK_test",
    AWS_REGION: "us-east-1",
    ...over,
  }) as unknown as Env;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the lexical lane", () => {
  it("turns a bm25 rank into a score where better is larger", async () => {
    const { db } = dbWith({
      lexical: [
        { listingId: "a", score: 2 },
        { listingId: "b", score: 0.5 },
      ],
    });
    const parsed = parseQuery("invoices");
    const hits = await Effect.runPromise(lexicalHits(db, parsed!));
    expect(hits).toEqual([
      { listingId: "a", score: 2 },
      { listingId: "b", score: 0.5 },
    ]);
  });

  it("needs enough of the words to count as a match", async () => {
    const db = partialDb({
      all: (_sql: string, params?: ReadonlyArray<Param>) => {
        const expression = String(params?.[0] ?? "");
        if (expression.includes("chase") || expression.includes("invoices")) {
          return Effect.succeed([{ listingId: "both", score: 2 }]);
        }
        if (expression.includes("late")) {
          return Effect.succeed([{ listingId: "both", score: 0.5 }, { listingId: "one", score: 3 }]);
        }
        return Effect.succeed([]);
      },
    });
    const parsed = parseQuery("chase late invoices");
    const hits = await Effect.runPromise(lexicalHits(db, parsed!));
    expect(hits.map((hit) => hit.listingId)).toEqual(["both"]);
    expect(hits[0]?.score).toBeCloseTo(4.5, 5);
  });

  it("survives a missing table during a deploy window", async () => {
    const db = partialDb({
      all: () =>
        Effect.fail(
          new DatabaseError({ operation: "all", cause: new Error("no such table") }),
        ),
    });
    const parsed = parseQuery("invoices");
    const hits = await Effect.runPromise(lexicalHits(db, parsed!));
    expect(hits).toEqual([]);
  });
});

describe("the semantic lane", () => {
  it("orders by cosine and ignores vectors of the wrong size", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ embedding: unit(0) }), { status: 200 })),
    );
    const { db } = dbWith({
      embeddings: [
        { listingId: "a", vector: encode(unit(0)) },
        { listingId: "b", vector: encode(unit(1)) },
        { listingId: "c", vector: encode([1, 2, 3]) },
      ],
    });
    const hits = await Effect.runPromise(semanticHits(env(), db, "chase invoices"));
    expect(hits.map((hit) => hit.listingId)).toEqual(["a", "b"]);
    expect(hits[0]?.score).toBeCloseTo(1, 5);
    expect(hits[1]?.score).toBeCloseTo(0, 5);
  });

  it("returns nothing when no model is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { db } = dbWith({});
    const hits = await Effect.runPromise(
      semanticHits(env({ AWS_BEDROCK_API_KEY: undefined }), db, "chase invoices"),
    );
    expect(hits).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns nothing and keeps the request alive when the model errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const { db } = dbWith({ embeddings: [{ listingId: "a", vector: encode(unit(0)) }] });
    const hits = await Effect.runPromise(semanticHits(env(), db, "chase invoices"));
    expect(hits).toEqual([]);
  });
});

describe("searching the catalogue", () => {
  it("blends a word match with a meaning match and drops the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ embedding: unit(0) }), { status: 200 })),
    );
    const { db } = dbWith({
      lexical: [
        { listingId: "a", score: 2 },
        { listingId: "d", score: 1 },
      ],
      embeddings: [
        { listingId: "b", vector: encode(unit(0)) },
        { listingId: "a", vector: encode(unit(1)) },
      ],
    });
    const rows = [
      { id: "a", name: "Klawva Inbox", tagline: "Answers your inbox.", avgRating: null },
      { id: "b", name: "Klawva Money Admin", tagline: "Tracks receipts.", avgRating: null },
      { id: "d", name: "Klawva Researcher", tagline: "Reads sources.", avgRating: null },
    ];
    const ranked = await Effect.runPromise(
      searchCatalog(env(), db, rows, "chase late invoices"),
    );
    expect(ranked.map((entry) => entry.id)).toEqual(["b", "a", "d"]);
    expect(ranked[0]?.why).toBe("close in meaning");
    expect(ranked[1]?.why).toBe("word match");
  });

  it("refuses a query too short to search", async () => {
    const { db } = dbWith({});
    const ranked = await Effect.runPromise(searchCatalog(env(), db, [], "a"));
    expect(ranked).toEqual([]);
  });
});

describe("indexing a listing", () => {
  it("writes the words and the vector for a published listing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ embedding: unit(3) }), { status: 200 })),
    );
    const { db, batches, writes } = dbWith({
      listing: {
        name: "Klawva Money Admin",
        tagline: "Tracks receipts and subscriptions.",
        category: "desktop",
        briefFields: '["task","output"]',
        soul: "You keep the books tidy.",
      },
    });
    const result = await Effect.runPromise(indexListing(env(), db, "a"));
    expect(result.embedded).toBe(true);
    const flat = batches.flat();
    expect(flat.some((statement) => statement.sql.includes("INSERT INTO listing_fts"))).toBe(true);
    expect(flat.some((statement) => statement.sql.includes("DELETE FROM listing_fts"))).toBe(true);
    const upsert = writes.find((write) => write.sql.includes("INSERT INTO listing_embeddings"));
    expect(upsert).toBeDefined();
    expect(upsert?.params?.[1]).toBe(TITAN_MODEL);
    expect(upsert?.params?.[2]).toBe(EMBED_DIMENSIONS);
  });

  it("removes a listing that is no longer published", async () => {
    const { db, batches, writes } = dbWith({ listing: null });
    const result = await Effect.runPromise(indexListing(env(), db, "gone"));
    expect(result.embedded).toBe(false);
    expect(batches.flat().every((statement) => statement.sql.startsWith("DELETE"))).toBe(true);
    expect(writes).toEqual([]);
  });

  it("keeps a store failure in the error channel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ embedding: unit(3) }), { status: 200 })),
    );
    const { db } = dbWith({
      listing: {
        name: "Klawva Inbox",
        tagline: "Answers your inbox.",
        category: "data",
        briefFields: "[]",
        soul: "",
      },
    });
    const broken: DatabaseImpl = {
      ...db,
      run: () =>
        Effect.fail(
          new DatabaseError({ operation: "run", cause: new Error("write failed") }),
        ),
    };
    const exit = await Effect.runPromiseExit(indexListing(env(), broken, "a"));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(Cause.hasDies(exit.cause)).toBe(false);
    }
  });

  it("indexes the words even when the model is unavailable", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { db, batches } = dbWith({
      listing: {
        name: "Klawva Inbox",
        tagline: "Answers your inbox.",
        category: "data",
        briefFields: "[]",
        soul: "",
      },
    });
    const result = await Effect.runPromise(
      indexListing(env({ AWS_BEDROCK_API_KEY: undefined }), db, "a"),
    );
    expect(result.embedded).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(batches.flat().some((statement) => statement.sql.includes("INSERT INTO listing_fts"))).toBe(true);
  });
});
