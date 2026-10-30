import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { rateLimited, type RateLimiter } from "../src/lib/guard.ts";

const broken: RateLimiter = {
  limit: async () => {
    throw new Error("limiter unavailable");
  },
};

const allows = (limited: RateLimiter, onError?: "block" | "allow"): Promise<boolean> =>
  Effect.runPromise(
    onError === undefined ? rateLimited(limited, "k") : rateLimited(limited, "k", onError),
  );

describe("the rate limiter guard", () => {
  it("keeps serving on a limiter outage unless the caller asks to block", async () => {
    expect(await allows(broken)).toBe(true);
    expect(await allows(broken, "allow")).toBe(true);
    expect(await allows(broken, "block")).toBe(false);
  });
});
