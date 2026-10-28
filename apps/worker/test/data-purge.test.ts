import { describe, expect, it } from "vitest";
import type { Manifest } from "../src/db/schema.ts";
import { declaredDataDirs, deletionDeadline, deletionOverdue, purgePlan } from "../src/desktop/data-purge.ts";

const bundle = {
  soul: "x",
  runtime: {
    kind: "desktop",
    billing: "author-metered",
    transport: ["desktop"],
    desktop: {
      bundleId: "clicky",
      entrypoint: "clicky.exe",
      dataDirs: ["%LOCALAPPDATA%/klawva/clicky"],
      platforms: ["windows"],
      capabilities: { screen: "read" },
    },
  },
} as unknown as Manifest;

describe("uninstall purge", () => {
  it("plans the declared directories", () => {
    const plan = purgePlan({ manifest: bundle, workspaceRoot: "C:/w" });
    expect(plan.ok).toBe(true);
    expect(plan.dirs[0]?.endsWith("/klawva/clicky")).toBe(true);
  });

  it("refuses a manifest with no declared directories", () => {
    expect(purgePlan({ manifest: { soul: "x" } as unknown as Manifest, workspaceRoot: "C:/w" })).toEqual({
      dirs: [],
      ok: false,
      reason: "no_data_dirs_declared",
    });
  });

  it("refuses an escaping path, including a windows absolute path", () => {
    const escape = JSON.parse(JSON.stringify(bundle)) as Manifest;
    (escape.runtime!.desktop as unknown as { dataDirs: string[] }).dataDirs = ["../../etc"];
    expect(purgePlan({ manifest: escape, workspaceRoot: "C:/w" }).reason).toBe("data_dir_outside_scope");

    const absolute = JSON.parse(JSON.stringify(bundle)) as Manifest;
    (absolute.runtime!.desktop as unknown as { dataDirs: string[] }).dataDirs = ["C:/Windows/System32"];
    expect(purgePlan({ manifest: absolute, workspaceRoot: "C:/w" }).reason).toBe("data_dir_outside_scope");
  });

  it("expands known variables instead of handing %LOCALAPPDATA% to the filesystem", () => {
    const plan = purgePlan({ manifest: bundle, workspaceRoot: "C:/w" });
    expect(plan.dirs[0]).not.toContain("%");
  });

  it("a deletion request has a 30 day deadline and can be overdue", () => {
    const deadline = deletionDeadline(new Date("2026-10-01T00:00:00Z"));
    expect(deadline.startsWith("2026-10-31")).toBe(true);
    expect(deletionOverdue(deadline, new Date("2026-11-01T00:00:00Z"))).toBe(true);
    expect(deletionOverdue(deadline, new Date("2026-10-15T00:00:00Z"))).toBe(false);
  });

  it("declared dirs read from the manifest, not from a request", () => {
    expect(declaredDataDirs(bundle).length).toBe(1);
  });
});
