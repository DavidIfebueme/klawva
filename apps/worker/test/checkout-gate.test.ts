import { describe, expect, it } from "vitest";
import { phonePathBlocked } from "../src/app.ts";

describe("phone path gate at checkout", () => {
  it("a desktop hire succeeds with bedrock off, the live site's state today", () => {
    expect(phonePathBlocked(["desktop"], false)).toBe(false);
  });

  it("a phone hire is blocked until bedrock is on, the gate's purpose", () => {
    expect(phonePathBlocked(["phone_out"], false)).toBe(true);
    expect(phonePathBlocked(["phone_in"], false)).toBe(true);
    expect(phonePathBlocked(["phone_out"], true)).toBe(false);
  });

  it("a cloud hire with no transports is never gated", () => {
    expect(phonePathBlocked([], false)).toBe(false);
  });

  it("a desktop plus phone hire is gated on the phone leg, not the desktop leg", () => {
    expect(phonePathBlocked(["desktop", "phone_out"], false)).toBe(true);
  });
});
