import { describe, expect, it } from "vitest";
import type { Manifest } from "../src/db/schema.ts";
import { flagEnabled, installVerdict } from "../src/desktop/install.ts";

const bundle = {
  soul: "x",
  runtime: {
    kind: "desktop",
    billing: "author-metered",
    transport: ["desktop"],
    desktop: {
      bundleId: "clicky",
      entrypoint: "clicky.exe",
      dataDirs: ["d"],
      platforms: ["windows"],
      capabilities: { screen: "read" },
    },
  },
} as unknown as Manifest;

describe("install gate", () => {
  it("installs on windows when the flag is on", () => {
    expect(installVerdict({ bundlesEnabled: true, hostPlatform: "win32", manifest: bundle })).toEqual({ ok: true });
  });

  it("refuses linux with a sentence, not a crash", () => {
    const verdict = installVerdict({ bundlesEnabled: true, hostPlatform: "linux", manifest: bundle });
    expect(verdict).toEqual({ ok: false, reason: "the desktop app is windows-only for now" });
  });

  it("the flag gates third-party installs only", () => {
    expect(installVerdict({ bundlesEnabled: false, hostPlatform: "win32", manifest: bundle })).toEqual({
      ok: false,
      reason: "bundles_disabled",
    });
    expect(flagEnabled("true")).toBe(true);
    expect(flagEnabled("1")).toBe(false);
    expect(flagEnabled(undefined)).toBe(false);
  });

  it("refuses a manifest that is not a bundle", () => {
    expect(installVerdict({ bundlesEnabled: true, hostPlatform: "win32", manifest: { soul: "x" } as unknown as Manifest })).toEqual({
      ok: false,
      reason: "not_a_bundle",
    });
  });
});
