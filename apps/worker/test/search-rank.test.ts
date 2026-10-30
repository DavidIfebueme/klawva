import { describe, expect, it } from "vitest";
import { rankListings, type Searchable } from "../src/search/rank.ts";

const rows: ReadonlyArray<Searchable> = [
  { id: "a", name: "Klawva Money Admin", tagline: "Tracks receipts and subscriptions.", avgRating: null },
  { id: "b", name: "Klawva Researcher", tagline: "Multi-source research reports.", avgRating: 5 },
  { id: "c", name: "Klawva Inbox", tagline: "Answers your inbox.", avgRating: 3 },
];

describe("ranking results", () => {
  it("pins an exact phrase in the name even with no lane hits", () => {
    const ranked = rankListings({ rows, lexical: [], semantic: [], phrase: "money admin" });
    expect(ranked.map((entry) => entry.id)).toEqual(["a"]);
    expect(ranked[0]?.why).toContain("money admin");
  });

  it("blends the two lanes and lets the stronger meaning win", () => {
    const ranked = rankListings({
      rows,
      lexical: [
        { listingId: "a", score: 2 },
        { listingId: "c", score: 1 },
      ],
      semantic: [
        { listingId: "b", score: 0.9 },
        { listingId: "a", score: 0.7 },
      ],
      phrase: "chase late invoices",
    });
    expect(ranked.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("returns nothing when the meaning is weak and no word matched", () => {
    const ranked = rankListings({
      rows,
      lexical: [],
      semantic: [{ listingId: "a", score: 0.1 }],
      phrase: "someone to design a logo",
    });
    expect(ranked).toEqual([]);
  });

  it("keeps a weak meaning when the words matched", () => {
    const ranked = rankListings({
      rows,
      lexical: [{ listingId: "a", score: 1 }],
      semantic: [{ listingId: "a", score: 0.1 }],
      phrase: "receipts",
    });
    expect(ranked.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("lets a rating break a tie without outranking a better match", () => {
    const ranked = rankListings({
      rows,
      lexical: [
        { listingId: "b", score: 2 },
        { listingId: "a", score: 1 },
      ],
      semantic: [],
      phrase: "reports",
    });
    expect(ranked.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("uses a rating only to order equal matches", () => {
    const equal = rankListings({
      rows,
      lexical: [
        { listingId: "c", score: 5 },
        { listingId: "a", score: 5 },
      ],
      semantic: [],
      phrase: "ledger",
    });
    expect(equal.map((entry) => entry.id)).toEqual(["c", "a"]);

    const better = rankListings({
      rows,
      lexical: [
        { listingId: "c", score: 2 },
        { listingId: "b", score: 1 },
      ],
      semantic: [],
      phrase: "ledger",
    });
    expect(better.map((entry) => entry.id)).toEqual(["c", "b"]);
  });

  it("drops a hit whose score is not a number", () => {
    const ranked = rankListings({
      rows,
      lexical: [
        { listingId: "a", score: Number.NaN },
        { listingId: "c", score: 1 },
      ],
      semantic: [],
      phrase: "ledger",
    });
    expect(ranked.map((entry) => entry.id)).toEqual(["c"]);
  });

  it("is deterministic on a tie", () => {
    const unrated = rows.map((row) => ({ ...row, avgRating: null }));
    const tied = rankListings({
      rows: unrated,
      lexical: [
        { listingId: "c", score: 5 },
        { listingId: "a", score: 5 },
      ],
      semantic: [],
      phrase: "anything",
    });
    expect(tied.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(JSON.stringify(tied)).toBe(
      JSON.stringify(
        rankListings({
          rows: unrated,
          lexical: [
            { listingId: "a", score: 5 },
            { listingId: "c", score: 5 },
          ],
          semantic: [],
          phrase: "anything",
        }),
      ),
    );
  });

  it("never ranks a listing that is not in the catalogue", () => {
    const ranked = rankListings({
      rows,
      lexical: [{ listingId: "ghost", score: 99 }],
      semantic: [{ listingId: "ghost", score: 0.99 }],
      phrase: "ghost",
    });
    expect(ranked).toEqual([]);
  });
});
