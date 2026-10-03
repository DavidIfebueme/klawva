import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { parseWebhook, verifyWebhook } from "../src/payments/breet.ts";

describe("breet webhook", () => {
  it("verifies the webhook secret", () => {
    expect(verifyWebhook("s", "s")).toBe(true);
    expect(verifyWebhook("x", "s")).toBe(false);
    expect(verifyWebhook(null, "s")).toBe(false);
    expect(verifyWebhook("s", "")).toBe(false);
  });

  it("parses a completed trade", async () => {
    const event = await Effect.runPromise(
      parseWebhook(
        '{"event":"trade.completed","eventId":"e1","status":"completed","amountInUSD":50,"destinationAddress":"ADDR"}',
      ),
    );
    expect(event.event).toBe("trade.completed");
    expect(event.destinationAddress).toBe("ADDR");
    expect(event.amountInUSD).toBe(50);
  });
});
