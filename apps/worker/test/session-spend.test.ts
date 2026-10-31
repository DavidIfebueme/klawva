import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { makeStore, type SessionSql } from "../src/session/agent.ts";

const fakeSql = (
  initial: Record<string, string>,
): { sql: SessionSql; meta: Map<string, string> } => {
  const meta = new Map(Object.entries(initial));
  return {
    meta,
    sql: {
      exec: (query, ...bindings) => {
        if (query.startsWith("SELECT value FROM session_meta")) {
          const key = String(bindings[0]);
          return {
            toArray: () => (meta.has(key) ? [{ value: meta.get(key) }] : []),
          };
        }
        if (query.startsWith("INSERT INTO session_meta")) {
          if (query.includes("'spent_minor'")) {
            meta.set("spent_minor", String(bindings[0]));
          } else {
            meta.set(String(bindings[0]), String(bindings[1]));
          }
        }
        return { toArray: () => [] };
      },
    },
  };
};

describe("session spend", () => {
  it("projects every spend to the session row", async () => {
    const { sql } = fakeSql({ budget_minor: "100", spent_minor: "10" });
    const projected: number[] = [];
    const store = makeStore(sql, (spent) => projected.push(spent));

    await Effect.runPromise(store.spend(40));
    await Effect.runPromise(store.spend(25));

    expect(projected).toEqual([50, 75]);
  });

  it("keeps the running total in the session store", async () => {
    const { sql, meta } = fakeSql({ budget_minor: "100", spent_minor: "0" });
    const store = makeStore(sql, () => undefined);

    await Effect.runPromise(store.spend(30));

    expect(meta.get("spent_minor")).toBe("30");
  });

  it("refuses a spend past the budget and projects nothing", async () => {
    const { sql } = fakeSql({ budget_minor: "100", spent_minor: "90" });
    const projected: number[] = [];
    const store = makeStore(sql, (spent) => projected.push(spent));

    const exit = await Effect.runPromiseExit(store.spend(20));

    expect(exit._tag).toBe("Failure");
    expect(projected).toEqual([]);
  });

  it("survives a projection that throws", async () => {
    const { sql, meta } = fakeSql({ budget_minor: "100", spent_minor: "0" });
    const store = makeStore(sql, () => {
      throw new Error("d1 unavailable");
    });

    await Effect.runPromise(store.spend(20));

    expect(meta.get("spent_minor")).toBe("20");
  });

  it("works when no projection is wired", async () => {
    const { sql, meta } = fakeSql({ budget_minor: "100", spent_minor: "0" });
    const store = makeStore(sql);

    await Effect.runPromise(store.spend(15));

    expect(meta.get("spent_minor")).toBe("15");
  });
});
