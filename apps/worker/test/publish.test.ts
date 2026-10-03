import { describe, expect, it } from "vitest";
import { statusForBand } from "../src/listings/publish.ts";

describe("publish band routing", () => {
  it("maps eval bands to listing statuses", () => {
    expect(statusForBand("auto")).toBe("in_review");
    expect(statusForBand("human")).toBe("in_review");
    expect(statusForBand("reject")).toBe("rejected");
  });
});
