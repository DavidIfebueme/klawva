import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "../src/lib/secure.ts";

describe("constant-time equality", () => {
  it("is true only for identical strings, including unequal lengths", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("ab", "abc")).toBe(false);
  });
});
