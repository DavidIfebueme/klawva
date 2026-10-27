const runtimeOverride =
  typeof globalThis.localStorage === "object"
    ? globalThis.localStorage.getItem("klawva.worker.url")
    : null;
const configured = runtimeOverride ?? import.meta.env.VITE_WORKER_URL;

export const workerBaseUrl: string =
  typeof configured === "string" && configured.length > 0
    ? configured.replace(/\/+$/, "")
    : "https://klawva.xyz";

export const verifyMode = (search: string): boolean =>
  new URLSearchParams(search).get("verify") === "1";

export const deviceStorageFile = "device.json";

export interface DeviceRecord {
  readonly deviceId: string;
  readonly token: string;
  readonly pairedAt: string;
}
