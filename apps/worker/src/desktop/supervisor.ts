import type { Manifest } from "../db/schema.ts";

export interface SpawnPlan {
  readonly port: number;
  readonly nonce: string;
  readonly env: Readonly<Record<string, string>>;
}

export const spawnPlan = (params: {
  readonly port: number;
  readonly nonce: string;
  readonly bundleId: string;
  readonly transport: "a2a-loopback";
}): SpawnPlan => ({
  port: params.port,
  nonce: params.nonce,
  env: {
    KLAWVA_BUNDLE_ID: params.bundleId,
    KLAWVA_A2A_PORT: String(params.port),
    KLAWVA_A2A_NONCE: params.nonce,
    KLAWVA_A2A_TRANSPORT: params.transport,
  },
});

export const isValidSpawnPort = (port: number): boolean =>
  Number.isInteger(port) && port >= 1_024 && port <= 65_535;

export const isValidNonce = (nonce: string): boolean => nonce.length >= 32;

export const firstCallVerdict = (params: {
  readonly expectedNonce: string;
  readonly receivedNonce: string | null;
  readonly peerAddress: string;
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } => {
  if (params.receivedNonce === null) {
    return { ok: false, reason: "nonce_missing" };
  }
  if (params.receivedNonce !== params.expectedNonce) {
    return { ok: false, reason: "nonce_mismatch" };
  }
  if (
    params.peerAddress !== "127.0.0.1" &&
    params.peerAddress !== "::1" &&
    !params.peerAddress.startsWith("127.")
  ) {
    return { ok: false, reason: "peer_not_loopback" };
  }
  return { ok: true };
};

export const killDecision = (params: {
  readonly revokedVersion: string | null;
  readonly runningVersion: string;
  readonly shiftEnded: boolean;
}): { readonly kill: boolean; readonly reason: string } => {
  if (params.revokedVersion !== null && params.revokedVersion === params.runningVersion) {
    return { kill: true, reason: "revoked" };
  }
  if (params.shiftEnded) {
    return { kill: true, reason: "shift_ended" };
  }
  return { kill: false, reason: "running" };
};

export const bundlePlatforms = (manifest: Manifest): ReadonlyArray<string> =>
  manifest.runtime?.desktop?.platforms ?? [];
