import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import {
  signBody,
  timingSafeEqual,
  verifySignature,
} from "../src/payments/paystack.ts";

describe("paystack signature", () => {
  it("verifies a body signed with the secret", async () => {
    const body = '{"event":"charge.success","data":{"reference":"r1"}}';
    const signature = await Effect.runPromise(
      signBody(body, "sk_test_example"),
    );
    const valid = await Effect.runPromise(
      verifySignature(body, "sk_test_example", signature),
    );
    const invalid = await Effect.runPromise(
      verifySignature(body, "sk_test_example", "deadbeef"),
    );
    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });

  it("compares in constant time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
});
