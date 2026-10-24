import { describe, expect, it } from "vitest";
import { isClaimShape, newPairCode } from "../src/client/pairing.ts";
import { isSessionRow } from "../src/client/session.ts";

describe("newPairCode", () => {
  it("renders the 4 dash 4 shape with the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = newPairCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it("carries forty bits, so brute force over the window is not cheap", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      seen.add(newPairCode());
    }
    expect(seen.size).toBe(500);
  });
});

describe("isClaimShape", () => {
  it.each([
    [{ id: "d1", token: "tok" }, true],
    [{ id: "d1" }, false],
    [{ token: "tok" }, false],
    [{ id: 1, token: "tok" }, false],
    [null, false],
    [[], false],
    ["claimed", false],
  ])("guards %j as %s", (value, expected) => {
    expect(isClaimShape(value)).toBe(expected);
  });
});

describe("isSessionRow", () => {
  it.each([
    [{ id: "s1", state: "active", listingName: "Ada" }, true],
    [{ id: "s1", state: "active", listingName: null }, true],
    [{ id: "s1" }, false],
    [{ state: "active" }, false],
    [{ id: "s1", state: 3 }, false],
    [null, false],
  ])("guards %j as %s", (value, expected) => {
    expect(isSessionRow(value)).toBe(expected);
  });
});
