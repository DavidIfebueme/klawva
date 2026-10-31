import type {
  DataPolicy,
  DesktopCapabilities,
  DesktopConfig,
  HostedConfig,
  Lane,
  LimitsConfig,
} from "@/lib/studio-api";

export interface LaneDraft {
  lane: Lane;
  cardUrl: string;
  mode: "push" | "pull";
  authType: string;
  authHeader: string;
  bundleId: string;
  entrypoint: string;
  dataDirs: string;
  screenRead: boolean;
  inputActions: string;
  networkHosts: string;
  fsScopes: string;
  launchMarkets: string[];
  retentionDays: string;
  leavesCountry: boolean;
  dpia: boolean;
  maxWallClockSeconds: string;
  maxEvents: string;
  maxEventBytes: string;
  maxArtifactBytes: string;
  minIdleSeconds: string;
}

export const emptyLaneDraft: LaneDraft = {
  lane: "authored",
  cardUrl: "",
  mode: "pull",
  authType: "",
  authHeader: "",
  bundleId: "",
  entrypoint: "",
  dataDirs: "",
  screenRead: false,
  inputActions: "",
  networkHosts: "",
  fsScopes: "",
  launchMarkets: [],
  retentionDays: "30",
  leavesCountry: false,
  dpia: false,
  maxWallClockSeconds: "86400",
  maxEvents: "500",
  maxEventBytes: "4096",
  maxArtifactBytes: "65536",
  minIdleSeconds: "300",
};

export const marketOptions = [
  { id: "us", label: "US" },
  { id: "in", label: "IN" },
  { id: "ng", label: "NG" },
];

const splitList = (raw: string): string[] =>
  raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const toPositive = (raw: string): number | undefined => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const hostedFrom = (draft: LaneDraft): HostedConfig => ({
  cardUrl: draft.cardUrl.trim(),
  mode: draft.mode,
  ...(draft.authType.trim().length > 0 ? { authType: draft.authType.trim() } : {}),
  ...(draft.authHeader.trim().length > 0
    ? { authHeader: draft.authHeader.trim() }
    : {}),
});

const capabilitiesFrom = (draft: LaneDraft): DesktopCapabilities => ({
  ...(draft.screenRead ? { screen: "read" } : {}),
  ...(splitList(draft.inputActions).length > 0
    ? { input: splitList(draft.inputActions) }
    : {}),
  ...(splitList(draft.networkHosts).length > 0
    ? { network: splitList(draft.networkHosts) }
    : {}),
  ...(splitList(draft.fsScopes).length > 0
    ? { fs: splitList(draft.fsScopes) }
    : {}),
});

const desktopFrom = (draft: LaneDraft): DesktopConfig => ({
  bundleId: draft.bundleId.trim(),
  entrypoint: draft.entrypoint.trim(),
  dataDirs: splitList(draft.dataDirs),
  capabilities: capabilitiesFrom(draft),
});

const dataFrom = (draft: LaneDraft): DataPolicy => ({
  retentionDays: toPositive(draft.retentionDays) ?? 30,
  leavesCountry: draft.leavesCountry,
  dpia: draft.dpia,
});

const limitsFrom = (draft: LaneDraft): LimitsConfig => {
  const wallClock = toPositive(draft.maxWallClockSeconds);
  const events = toPositive(draft.maxEvents);
  const eventBytes = toPositive(draft.maxEventBytes);
  const artifactBytes = toPositive(draft.maxArtifactBytes);
  const idleSeconds = toPositive(draft.minIdleSeconds);
  return {
    ...(wallClock !== undefined ? { maxWallClockSeconds: wallClock } : {}),
    ...(events !== undefined ? { maxEvents: events } : {}),
    ...(eventBytes !== undefined ? { maxEventBytes: eventBytes } : {}),
    ...(artifactBytes !== undefined ? { maxArtifactBytes: artifactBytes } : {}),
    ...(idleSeconds !== undefined ? { minIdleSeconds: idleSeconds } : {}),
  };
};

export interface LanePayload {
  lane: Lane;
  launchMarkets?: ReadonlyArray<string>;
  hosted?: HostedConfig;
  desktop?: DesktopConfig;
  data?: DataPolicy;
  limits?: LimitsConfig;
}

export const lanePayload = (draft: LaneDraft): LanePayload => {
  if (draft.lane === "hosted") {
    return {
      lane: "hosted",
      launchMarkets: draft.launchMarkets,
      hosted: hostedFrom(draft),
      data: dataFrom(draft),
      limits: limitsFrom(draft),
    };
  }
  if (draft.lane === "desktop") {
    return {
      lane: "desktop",
      launchMarkets: draft.launchMarkets,
      desktop: desktopFrom(draft),
      data: dataFrom(draft),
      limits: limitsFrom(draft),
    };
  }
  return { lane: "authored" };
};
