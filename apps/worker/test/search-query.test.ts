import { describe, expect, it } from "vitest";
import { parseQuery, requiredCoverage, tokenExpression } from "../src/search/query.ts";

describe("parsing a search query", () => {
  it("refuses queries with nothing to search for", () => {
    expect(parseQuery("")).toBeNull();
    expect(parseQuery("   ")).toBeNull();
    expect(parseQuery("a")).toBeNull();
    expect(parseQuery("!!!")).toBeNull();
    expect(parseQuery(" -- ")).toBeNull();
  });

  it("folds case and collapses whitespace", () => {
    const parsed = parseQuery("  Chase   LATE\n invoices  ");
    expect(parsed?.phrase).toBe("chase late invoices");
    expect(parsed?.tokens).toEqual(["chase", "late", "invoices"]);
  });

  it("strips control characters instead of passing them to the index", () => {
    const parsed = parseQuery("chase\u0000\u0007 invoices\u007f");
    expect(parsed?.tokens).toEqual(["chase", "invoices"]);
  });

  it("drops filler words that would match every listing", () => {
    const parsed = parseQuery("someone who can help me with my finances");
    expect(parsed?.tokens).toEqual(["finances"]);
  });

  it("keeps the words when a query is nothing but filler", () => {
    const parsed = parseQuery("someone who can help me");
    expect(parsed?.tokens).toEqual(["someone", "who", "can", "help", "me"]);
  });

  it("drops duplicate tokens and caps the token count", () => {
    const parsed = parseQuery("invoice invoice invoice chase payments");
    expect(parsed?.tokens).toEqual(["invoice", "chase", "payments"]);
    const long = parseQuery(Array.from({ length: 30 }, (_, index) => `word${index}`).join(" "));
    expect(long?.tokens).toHaveLength(12);
  });

  it("caps the query length", () => {
    const parsed = parseQuery("chase ".repeat(100));
    expect(parsed?.phrase.length).toBeLessThanOrEqual(200);
  });
});

describe("building the fts5 term", () => {
  it("quotes the token so fts5 operators never reach the parser", () => {
    const parsed = parseQuery('chase "late invoices" -payment (urgent) NEAR/2 e-mail');
    expect(parsed?.tokens).toEqual([
      "chase",
      "late",
      "invoices",
      "payment",
      "urgent",
      "near",
      "mail",
    ]);
    expect(tokenExpression("chase")).toBe('"chase"*');
  });

  it("keeps a lone quote and a lone hyphen harmless", () => {
    expect(parseQuery('"')).toBeNull();
    expect(parseQuery("-")).toBeNull();
    const parsed = parseQuery("24-hour");
    expect(parsed?.tokens).toEqual(["24", "hour"]);
    expect(parsed?.tokens.map(tokenExpression)).toEqual(['"24"*', '"hour"*']);
  });
});

describe("coverage required to count as a word match", () => {
  it("wants every word for a short query", () => {
    expect(requiredCoverage(1)).toBe(1);
    expect(requiredCoverage(2)).toBe(2);
  });

  it("wants half the words for a longer query", () => {
    expect(requiredCoverage(3)).toBe(2);
    expect(requiredCoverage(5)).toBe(3);
    expect(requiredCoverage(12)).toBe(6);
  });
});
