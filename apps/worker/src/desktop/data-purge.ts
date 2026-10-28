import type { Manifest } from "../db/schema.ts";

export const declaredDataDirs = (manifest: Manifest): ReadonlyArray<string> =>
  manifest.runtime?.desktop?.dataDirs ?? [];

const expandKnownVars = (dir: string): string => {
  const home = process.env.LOCALAPPDATA ?? process.env.HOME ?? "";
  return dir
    .replace(/%LOCALAPPDATA%/gi, home)
    .replace(/%APPDATA%/gi, home)
    .replace(/^~/, home);
};

export interface PurgePlan {
  readonly dirs: ReadonlyArray<string>;
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * uninstall has to remove the declared directories. a screen-reading bundle
 * accumulates transcripts and screenshots, and under NDPA the customer has a
 * deletion right we must be able to honour.
 */
export const purgePlan = (params: {
  readonly manifest: Manifest;
  readonly workspaceRoot: string;
}): PurgePlan => {
  const declared = declaredDataDirs(params.manifest);
  if (declared.length === 0) {
    return { dirs: [], ok: false, reason: "no_data_dirs_declared" };
  }
  const escapes = declared.filter((dir) => {
    const relative = dir.startsWith("%") || dir.startsWith("~");
    if (dir.includes("..")) {
      return true;
    }
    if (relative) {
      return false;
    }
    return dir.startsWith("/") || dir.startsWith("\\") || /^[A-Za-z]:/.test(dir);
  });
  if (escapes.length > 0) {
    return { dirs: [], ok: false, reason: "data_dir_outside_scope" };
  }
  return { dirs: declared.map(expandKnownVars), ok: true };
};

export const DELETE_WINDOW_DAYS = 30;

export const deletionDeadline = (requestedAt: Date): string =>
  new Date(requestedAt.getTime() + DELETE_WINDOW_DAYS * 86_400_000).toISOString();

export const deletionOverdue = (deadline: string, now: Date = new Date()): boolean =>
  Date.parse(deadline) < now.getTime();
