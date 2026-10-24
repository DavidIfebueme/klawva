export const workerBaseUrl = "https://klawva.xyz";

export const deviceStorageFile = "device.json";

export interface DeviceRecord {
  readonly deviceId: string;
  readonly token: string;
  readonly pairedAt: string;
}
