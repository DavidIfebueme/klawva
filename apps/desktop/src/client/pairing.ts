import { workerBaseUrl } from "./config.ts";

export interface ClaimedDevice {
  readonly deviceId: string;
  readonly token: string;
}

export const isClaimShape = (value: unknown): value is { id: string; token: string } =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string" &&
  "token" in value &&
  typeof value.token === "string";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const newPairCode = (): string => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

export const claimDevice = async (
  code: string,
): Promise<ClaimedDevice | null> => {
  const response = await fetch(`${workerBaseUrl}/api/devices/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`claim failed with ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isClaimShape(body)) {
    throw new Error("claim returned an unexpected shape");
  }
  return { deviceId: body.id, token: body.token };
};

export const waitForClaim = async (
  code: string,
  onWait: (seconds: number) => void,
  timeoutSeconds = 600,
): Promise<ClaimedDevice> => {
  const started = Date.now();
  for (;;) {
    const elapsed = Math.floor((Date.now() - started) / 1000);
    if (elapsed > timeoutSeconds) {
      throw new Error("pairing timed out");
    }
    const claimed = await claimDevice(code);
    if (claimed !== null) {
      return claimed;
    }
    onWait(elapsed);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
};
