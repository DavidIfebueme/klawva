import type { Manifest } from "../db/schema.ts";

export type InstallVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export const platformLabel = (platform: string): string => {
  if (platform === "win32" || platform === "windows") return "windows";
  if (platform === "linux") return "linux";
  if (platform === "darwin") return "mac";
  return platform;
};

/**
 * desktop v1 is windows-only. a linux or mac machine gets a sentence, not a
 * crash and not a partial install.
 */
export const installVerdict = (params: {
  readonly bundlesEnabled: boolean;
  readonly hostPlatform: string;
  readonly manifest: Manifest;
}): InstallVerdict => {
  if (!params.bundlesEnabled) {
    return { ok: false, reason: "bundles_disabled" };
  }
  const desktop = params.manifest.runtime?.desktop;
  if (desktop === undefined) {
    return { ok: false, reason: "not_a_bundle" };
  }
  const host = platformLabel(params.hostPlatform);
  if (!desktop.platforms.includes("windows") && host === "windows") {
    return { ok: false, reason: "bundle_not_for_windows" };
  }
  if (!desktop.platforms.includes(host as "windows" | "linux" | "mac")) {
    return {
      ok: false,
      reason:
        host === "linux" || host === "mac"
          ? "the desktop app is windows-only for now"
          : "this computer is not supported yet",
    };
  }
  return { ok: true };
};

export const flagEnabled = (value: string | undefined): boolean => value === "true";
