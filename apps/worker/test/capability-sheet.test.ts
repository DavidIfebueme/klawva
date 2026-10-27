import { describe, expect, it } from "vitest";
import type { Manifest } from "../src/db/schema.ts";
import { capabilitySentences } from "../src/desktop/capability-sheet.ts";

const clicky = {
  soul: "x",
  schema: 2,
  runtime: {
    kind: "desktop",
    billing: "author-metered",
    transport: ["desktop"],
    desktop: {
      bundleId: "clicky",
      entrypoint: "clicky.exe",
      dataDirs: ["%LOCALAPPDATA%/klawva/clicky"],
      platforms: ["windows"],
      network: ["api.clicky.dev"],
      capabilities: { screen: "read", input: ["click", "type"], fs: ["workspace"] },
    },
  },
  data: { retentionDays: 30, leavesCountry: true, dpia: true },
  report: { requireEvidence: true, minEvidence: 1 },
} as unknown as Manifest;

describe("capability sheet", () => {
  it("says what a screen-reading bundle can actually do", () => {
    const sheet = capabilitySentences(clicky);
    expect(sheet.sentences).toContain("It can see what is on your screen while it works.");
    expect(sheet.sentences.join(" ")).toContain("mouse and keyboard");
    expect(sheet.sentences.join(" ")).toContain("workspace folder you pick");
  });

  it("names the network hosts in the sentence, not in a footnote", () => {
    const sheet = capabilitySentences(clicky);
    expect(sheet.sentences.join(" ")).toContain("api.clicky.dev");
    expect(sheet.privacyLine).toContain("talks to the internet");
  });

  it("only says 'stays on your machine' when nothing is declared outbound", () => {
    const offline = JSON.parse(JSON.stringify(clicky)) as Manifest & {
      runtime: { desktop: { network?: string[] } };
    };
    delete offline.runtime.desktop.network;
    const sheet = capabilitySentences(offline as unknown as Manifest);
    expect(sheet.privacyLine).toContain("stays on your machine");
  });

  it("returns nothing for an authored listing", () => {
    const sheet = capabilitySentences({ soul: "x" } as unknown as Manifest);
    expect(sheet.declared).toBe(false);
    expect(sheet.sentences.length).toBe(0);
  });
});
