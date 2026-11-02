import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  currencyForCountry,
  displayContext,
  refreshRates,
  refreshRatesIfStale,
} from "../src/lib/fx.ts";

const fakeDb = (initial: Readonly<Record<string, { perNgn: number; updatedAt: string }>>) => {
  const rates = new Map(Object.entries(initial));
  const writes: Array<{ sql: string; params?: ReadonlyArray<Param> }> = [];
  const db = {
    all: () => Effect.succeed([] as ReadonlyArray<Row>),
    first: (sql: string, params?: ReadonlyArray<Param>) => {
      if (sql.startsWith("SELECT per_ngn")) {
        const found = rates.get(String(params?.[0]));
        return Effect.succeed(
          found === undefined
            ? null
            : { perNgn: found.perNgn, updatedAt: found.updatedAt },
        );
      }
      if (sql.startsWith("SELECT MAX(updated_at)")) {
        const stamps = [...rates.values()].map((entry) => entry.updatedAt).sort();
        return Effect.succeed({ updatedAt: stamps.at(-1) ?? null });
      }
      return Effect.succeed(null);
    },
    run: (sql: string, params?: ReadonlyArray<Param>) => {
      writes.push({ sql: String(sql), params });
      return Effect.void;
    },
    batch: (statements: ReadonlyArray<{ sql: string; params?: ReadonlyArray<Param> }>) => {
      for (const statement of statements) {
        writes.push(statement);
        const currency = statement.sql.includes("'USD'") ? "USD" : "INR";
        rates.set(currency, {
          perNgn: Number(statement.params?.[0] ?? 0),
          updatedAt: String(statement.params?.[1] ?? ""),
        });
      }
      return Effect.void;
    },
    changed: () => Effect.succeed(0),
  } as DatabaseImpl;
  return { db, rates, writes };
};

const payload = (usd: number, inr: number) => ({
  result: "success",
  rates: { USD: usd, INR: inr },
});

describe("display currency", () => {
  it("maps india and the united states, and falls back to naira", () => {
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("NG")).toBe("NGN");
    expect(currencyForCountry("DE")).toBe("NGN");
    expect(currencyForCountry(null)).toBe("NGN");
  });
});

describe("refreshing rates", () => {
  it("stores the usd and inr rate from the provider", async () => {
    const { db, rates } = fakeDb({});
    const stored = await Effect.runPromise(
      refreshRates(db, async () => new Response(JSON.stringify(payload(0.0007, 0.07))), new Date("2026-11-02T00:00:00Z")),
    );
    expect(stored).toBe(true);
    expect(rates.get("USD")?.perNgn).toBe(0.0007);
    expect(rates.get("INR")?.perNgn).toBe(0.07);
  });

  it("keeps the old rate when the provider fails", async () => {
    const { db, rates } = fakeDb({
      USD: { perNgn: 0.00074, updatedAt: "2026-11-01T00:00:00Z" },
    });
    const stored = await Effect.runPromise(
      refreshRates(db, async () => new Response("nope", { status: 500 })),
    );
    expect(stored).toBe(false);
    expect(rates.get("USD")?.perNgn).toBe(0.00074);
  });

  it("skips the refresh when the last one is fresh", async () => {
    const { db } = fakeDb({
      USD: { perNgn: 0.00074, updatedAt: "2026-11-01T00:00:00Z" },
      INR: { perNgn: 0.07, updatedAt: "2026-11-01T00:00:00Z" },
    });
    let called = false;
    const ran = await Effect.runPromise(
      refreshRatesIfStale(
        db,
        async () => {
          called = true;
          return new Response(JSON.stringify(payload(1, 1)));
        },
        new Date("2026-11-01T06:00:00Z"),
      ),
    );
    expect(ran).toBe(false);
    expect(called).toBe(false);
  });

  it("refreshes when the last one is old", async () => {
    const { db, rates } = fakeDb({
      USD: { perNgn: 0.00074, updatedAt: "2026-10-01T00:00:00Z" },
      INR: { perNgn: 0.07, updatedAt: "2026-10-01T00:00:00Z" },
    });
    const ran = await Effect.runPromise(
      refreshRatesIfStale(
        db,
        async () => new Response(JSON.stringify(payload(0.0008, 0.08))),
        new Date("2026-11-01T00:00:00Z"),
      ),
    );
    expect(ran).toBe(true);
    expect(rates.get("INR")?.perNgn).toBe(0.08);
  });
});

describe("the display context", () => {
  it("returns the rate for the visitor's country", async () => {
    const { db } = fakeDb({
      INR: { perNgn: 0.0703, updatedAt: "2026-11-01T00:00:00Z" },
    });
    const context = await Effect.runPromise(displayContext(db, "IN"));
    expect(context).toEqual({
      country: "IN",
      currency: "INR",
      rate: 0.0703,
      updatedAt: "2026-11-01T00:00:00Z",
    });
  });

  it("falls back to naira when the rate is missing", async () => {
    const { db } = fakeDb({});
    const context = await Effect.runPromise(displayContext(db, "US"));
    expect(context.currency).toBe("NGN");
    expect(context.rate).toBe(1);
  });

  it("never converts for a naira visitor", async () => {
    const { db } = fakeDb({});
    const context = await Effect.runPromise(displayContext(db, "NG"));
    expect(context).toEqual({ country: "NG", currency: "NGN", rate: 1, updatedAt: null });
  });
});
