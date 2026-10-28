import { invoke } from "@tauri-apps/api/core";

export interface SupervisorConfig {
  readonly bundleId: string;
  readonly entrypoint: string;
  readonly version: string;
  readonly sha256: string;
  readonly workerBaseUrl: string;
  readonly deviceToken: string;
}

export const randomNonce = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const spawnBundle = async (config: SupervisorConfig): Promise<string> => {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const nonce = randomNonce();
  const handshake = await invoke<string>("bundle_spawn", {
    entrypoint: config.entrypoint,
    port,
    nonce,
    bundleId: config.bundleId,
  });
  const allowed = await checkAllowed(config);
  if (!allowed.allowed) {
    await invoke("bundle_kill");
    throw new Error(allowed.reason ?? "bundle_not_allowed");
  }
  return `http://127.0.0.1:${port}`;
};

export const checkAllowed = (
  config: SupervisorConfig,
): Promise<{ allowed: boolean; reason?: string }> =>
  fetch(
    `${config.workerBaseUrl}/api/device/bundles/${encodeURIComponent(config.bundleId)}/allowed?version=${encodeURIComponent(config.version)}&sha256=${encodeURIComponent(config.sha256)}&host=${navigator.platform === "Win32" ? "windows" : "linux"}`,
    { headers: { "x-auth-token": config.deviceToken } },
  ).then((response) => response.json());

export const startSupervisor = (
  config: SupervisorConfig,
  onKilled: () => void,
  intervalMs = 300_000,
): (() => void) => {
  const timer = setInterval(() => {
    void checkAllowed(config).then((allowed) => {
      if (!allowed.allowed) {
        void invoke("bundle_kill");
        onKilled();
      }
    });
  }, intervalMs);
  return () => clearInterval(timer);
};
