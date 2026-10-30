import type {
  HostedRuntime,
  LaunchMarket,
  LimitsManifest,
  Manifest,
  RuntimeManifest,
} from "../db/schema.ts";

export const PLATFORM_LIMITS = {
  maxWallClockSeconds: 86_400,
  maxEvents: 500,
  maxEventBytes: 4_096,
  maxArtifactBytes: 65_536,
  minIdleSeconds: 300,
} as const;

export const CURRENT_MANIFEST_SCHEMA = 2;

export type ManifestVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: ReadonlyArray<string> };

const knownKeys = new Set([
  "schema",
  "soul",
  "voice",
  "phone",
  "desktop",
  "launchMarkets",
  "runtime",
  "limits",
  "report",
  "data",
]);

const hostedAllowed = new Set(["cardUrl", "mode", "auth"]);
const desktopUnknownAllowed = new Set([
  "bundleId",
  "entrypoint",
  "dataDirs",
  "platforms",
  "network",
  "capabilities",
]);

const isHttps = (value: string): boolean => value.startsWith("https://");

export const validateManifest = (manifest: Manifest): ManifestVerdict => {
  const reasons: string[] = [];

  for (const key of Object.keys(manifest)) {
    if (!knownKeys.has(key)) {
      reasons.push(`unknown_key:${key}`);
    }
  }

  const schema = manifest.schema ?? 1;
  if (schema !== CURRENT_MANIFEST_SCHEMA) {
    if (manifest.runtime !== undefined || manifest.limits !== undefined) {
      reasons.push("v2_blocks_on_v1_manifest");
    }
  }

  const runtime = manifest.runtime;
  if (runtime !== undefined && (runtime === null || typeof runtime !== "object")) {
    reasons.push("runtime_not_an_object");
  }
  if (runtime !== undefined) {
    if (runtime.kind === "authored") {
      if (runtime.hosted !== undefined) {
        reasons.push("authored_with_hosted_block");
      }
      if (runtime.desktop !== undefined) {
        reasons.push("authored_with_desktop_block");
      }
      if (runtime.billing === "author-metered") {
        reasons.push("authored_cannot_be_author_metered");
      }
    }

    if (runtime.kind === "hosted" && runtime.desktop !== undefined) {
      reasons.push("hosted_with_desktop_block");
    }
    if (runtime.kind === "hosted") {
      if (runtime.billing === "platform-metered") {
        reasons.push("hosted_cannot_be_platform_metered");
      }
      if (runtime.hosted === undefined) {
        reasons.push("hosted_block_missing");
      } else {
        if (!isHttps(runtime.hosted.cardUrl)) {
          reasons.push("hosted_card_url_not_https");
        }
        for (const key of Object.keys(runtime.hosted)) {
          if (!hostedAllowed.has(key)) {
            reasons.push(`unknown_hosted_key:${key}`);
          }
        }
      }
      if (!runtime.transport.includes("web")) {
        reasons.push("hosted_v1_is_web_only");
      }
    }

    if (runtime.kind === "desktop" && runtime.hosted !== undefined) {
      reasons.push("desktop_with_hosted_block");
    }
    if (runtime.kind === "desktop") {
      const desktop = runtime.desktop;
      if (desktop === undefined) {
        reasons.push("desktop_block_missing");
      } else {
        for (const key of Object.keys(desktop)) {
          if (!desktopUnknownAllowed.has(key)) {
            reasons.push(`unknown_desktop_key:${key}`);
          }
        }
        if (desktop.dataDirs.length === 0) {
          reasons.push("desktop_data_dirs_empty");
        }
        if (!desktop.platforms.includes("windows")) {
          reasons.push("desktop_v1_requires_windows");
        }
        if (desktop.platforms.some((platform) => platform !== "windows")) {
          reasons.push("desktop_v1_is_windows_only");
        }
      }
      if (runtime.billing === "platform-metered") {
        reasons.push("desktop_cannot_be_platform_metered");
      }
    }
  }

  if (manifest.limits !== undefined) {
    for (const key of Object.keys(manifest.limits)) {
      if (!(key in PLATFORM_LIMITS)) {
        reasons.push(`unknown_limit_key:${key}`);
      }
    }
    for (const [key, ceiling] of Object.entries(PLATFORM_LIMITS)) {
      const value = manifest.limits[key as keyof typeof PLATFORM_LIMITS];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        reasons.push(`limit_invalid:${key}`);
      } else if (value > ceiling) {
        reasons.push(`limit_widened:${key}`);
      }
    }
  }

  if (runtime !== undefined && runtime.kind !== "authored") {
    if (manifest.report?.requireEvidence !== true) {
      reasons.push("evidence_required_for_third_party");
    }
  }

  if (runtime === undefined && manifest.report !== undefined) {
    reasons.push("report_policy_without_runtime");
  }

  if (runtime !== undefined && runtime.kind !== "authored") {
    if (manifest.data === undefined) {
      reasons.push("data_policy_missing");
    } else {
      if (manifest.data.retentionDays <= 0) {
        reasons.push("data_retention_missing");
      }
      if (!manifest.data.dpia) {
        reasons.push("dpia_required");
      }
    }
  }

  if (
    manifest.data !== undefined &&
    manifest.data.retentionDays > 365
  ) {
    reasons.push("retention_too_long");
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
};

export const needsEvidence = (manifest: Manifest): boolean =>
  manifest.runtime !== undefined && manifest.runtime.kind !== "authored";

export const effectiveLimits = (manifest: Manifest) => {
  const stated = manifest.limits;
  return {
    maxWallClockSeconds: Math.min(
      stated?.maxWallClockSeconds ?? PLATFORM_LIMITS.maxWallClockSeconds,
      PLATFORM_LIMITS.maxWallClockSeconds,
    ),
    maxEvents: Math.min(
      stated?.maxEvents ?? PLATFORM_LIMITS.maxEvents,
      PLATFORM_LIMITS.maxEvents,
    ),
    maxEventBytes: Math.min(
      stated?.maxEventBytes ?? PLATFORM_LIMITS.maxEventBytes,
      PLATFORM_LIMITS.maxEventBytes,
    ),
    maxArtifactBytes: Math.min(
      stated?.maxArtifactBytes ?? PLATFORM_LIMITS.maxArtifactBytes,
      PLATFORM_LIMITS.maxArtifactBytes,
    ),
    minIdleSeconds: Math.max(
      stated?.minIdleSeconds ?? PLATFORM_LIMITS.minIdleSeconds,
      PLATFORM_LIMITS.minIdleSeconds,
    ),
  };
};

export type Lane = "authored" | "hosted" | "desktop";

export interface HostedDraft {
  readonly cardUrl: string;
  readonly mode: "push" | "pull";
  readonly authType?: string;
  readonly authHeader?: string;
}

export type DesktopPlatform = "windows" | "linux" | "mac";

export interface DesktopDraft {
  readonly bundleId: string;
  readonly entrypoint: string;
  readonly dataDirs: ReadonlyArray<string>;
  readonly capabilities: {
    readonly screen?: "read";
    readonly input?: ReadonlyArray<string>;
    readonly network?: ReadonlyArray<string>;
    readonly fs?: ReadonlyArray<string>;
  };
  readonly platforms?: ReadonlyArray<DesktopPlatform>;
}

export interface DataDraft {
  readonly retentionDays: number;
  readonly leavesCountry: boolean;
  readonly dpia: boolean;
}

export interface LimitsDraft {
  readonly maxWallClockSeconds?: number;
  readonly maxEvents?: number;
  readonly maxEventBytes?: number;
  readonly maxArtifactBytes?: number;
  readonly minIdleSeconds?: number;
}

export interface LaneDraft {
  readonly soul: string;
  readonly lane: Lane;
  readonly launchMarkets?: ReadonlyArray<LaunchMarket>;
  readonly hosted?: HostedDraft;
  readonly desktop?: DesktopDraft;
  readonly data?: DataDraft;
  readonly limits?: LimitsDraft;
}

export type LaneDraftVerdict =
  | { readonly ok: true; readonly manifest: Manifest }
  | { readonly ok: false; readonly reasons: ReadonlyArray<string> };

const limitsFor = (input: LimitsDraft | undefined): LimitsManifest => ({
  maxWallClockSeconds:
    input?.maxWallClockSeconds ?? PLATFORM_LIMITS.maxWallClockSeconds,
  maxEvents: input?.maxEvents ?? PLATFORM_LIMITS.maxEvents,
  maxEventBytes: input?.maxEventBytes ?? PLATFORM_LIMITS.maxEventBytes,
  maxArtifactBytes: input?.maxArtifactBytes ?? PLATFORM_LIMITS.maxArtifactBytes,
  minIdleSeconds: input?.minIdleSeconds ?? PLATFORM_LIMITS.minIdleSeconds,
});

const hostedRuntime = (input: HostedDraft | undefined): HostedRuntime | undefined =>
  input === undefined
    ? undefined
    : {
        cardUrl: input.cardUrl,
        mode: input.mode,
        ...(input.authType === undefined || input.authHeader === undefined
          ? {}
          : { auth: { type: input.authType, header: input.authHeader } }),
      };

const runtimeFor = (draft: LaneDraft): RuntimeManifest => {
  if (draft.lane === "hosted") {
    return {
      kind: "hosted",
      billing: "author-metered",
      transport: ["web"],
      hosted: hostedRuntime(draft.hosted),
    };
  }
  if (draft.lane === "desktop") {
    const desktop = draft.desktop;
    return {
      kind: "desktop",
      billing: "author-metered",
      transport: ["desktop"],
      desktop:
        desktop === undefined
          ? undefined
          : {
              bundleId: desktop.bundleId,
              entrypoint: desktop.entrypoint,
              dataDirs: [...desktop.dataDirs],
              platforms: desktop.platforms === undefined ? ["windows"] : [...desktop.platforms],
              network: desktop.capabilities.network,
              capabilities: {
                ...(desktop.capabilities.screen === undefined
                  ? {}
                  : { screen: desktop.capabilities.screen }),
                ...(desktop.capabilities.input === undefined
                  ? {}
                  : { input: [...desktop.capabilities.input] }),
                ...(desktop.capabilities.network === undefined
                  ? {}
                  : { network: [...desktop.capabilities.network] }),
                ...(desktop.capabilities.fs === undefined
                  ? {}
                  : { fs: [...desktop.capabilities.fs] }),
              },
            },
    };
  }
  return { kind: "authored", billing: "platform-metered", transport: ["web"] };
};

const laneBlockReasons = (draft: LaneDraft): ReadonlyArray<string> => {
  const reasons: string[] = [];
  if (draft.lane === "authored") {
    if (draft.hosted !== undefined) {
      reasons.push("authored_with_hosted_block");
    }
    if (draft.desktop !== undefined) {
      reasons.push("authored_with_desktop_block");
    }
  }
  if (draft.lane === "hosted" && draft.desktop !== undefined) {
    reasons.push("hosted_with_desktop_block");
  }
  if (draft.lane === "desktop" && draft.hosted !== undefined) {
    reasons.push("desktop_with_hosted_block");
  }
  return reasons;
};

export const manifestForLane = (draft: LaneDraft): LaneDraftVerdict => {
  const blocked = laneBlockReasons(draft);
  if (blocked.length > 0) {
    return { ok: false, reasons: blocked };
  }
  const authored = draft.lane === "authored";
  const manifest: Manifest = {
    schema: CURRENT_MANIFEST_SCHEMA,
    soul: draft.soul,
    ...(draft.launchMarkets === undefined
      ? {}
      : { launchMarkets: [...draft.launchMarkets] }),
    ...(authored ? {} : { runtime: runtimeFor(draft) }),
    ...(authored && draft.limits === undefined
      ? {}
      : { limits: limitsFor(draft.limits) }),
    ...(authored
      ? {}
      : {
          report: { requireEvidence: true, minEvidence: 1 },
          data: draft.data ?? { retentionDays: 30, leavesCountry: false, dpia: false },
        }),
  };
  const verdict = validateManifest(manifest);
  return verdict.ok
    ? { ok: true, manifest }
    : { ok: false, reasons: verdict.reasons };
};
