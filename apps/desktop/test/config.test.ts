import { describe, expect, it } from "vitest";
import { verifyMode, workerBaseUrl } from "../src/client/config.ts";

describe("desktop worker url", () => {
  it("defaults to production when nothing is configured", () => {
    expect(workerBaseUrl).toBe("https://klawva.xyz");
  });

  it("recognises the verify flag only when it is exactly 1", () => {
    expect(verifyMode("?verify=1")).toBe(true);
    expect(verifyMode("?verify=0")).toBe(false);
    expect(verifyMode("")).toBe(false);
  });
});
