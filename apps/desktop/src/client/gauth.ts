import { invoke } from "@tauri-apps/api/core";
import {
  buildAuthUrl,
  exchangeCode,
  newPkceVerifier,
  newState,
  pkceChallenge,
  refreshAccessToken,
  type GoogleTokens,
} from "./gmail.ts";

const refreshTokenKey = "gmail_refresh_token";

export const startGoogleConnect = async (): Promise<GoogleTokens> => {
  const verifier = newPkceVerifier();
  const challenge = await pkceChallenge(verifier);
  const state = newState();
  const port = await invoke<number>("start_loopback", { expectedState: state });
  const redirectUri = `http://127.0.0.1:${port}`;
  const url = buildAuthUrl({ challenge, state, redirectUri });
  window.open(url, "_blank");
  const query = await waitForCallback();
  const code = new URLSearchParams(query).get("code");
  if (code === null || code.length === 0) {
    throw new Error("google did not return a code");
  }
  const tokens = await exchangeCode(code, verifier, redirectUri);
  if (tokens.refreshToken !== null) {
    await invoke("store_secret", { name: refreshTokenKey, value: tokens.refreshToken });
  }
  return tokens;
};

const waitForCallback = async (timeoutMs = 300_000): Promise<string> => {
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("google connect timed out");
    }
    const outcome = await invoke<{ Ok?: string; Err?: string } | null>(
      "take_loopback_result",
    );
    if (outcome !== null) {
      if (typeof outcome.Ok === "string") {
        return outcome.Ok;
      }
      throw new Error(outcome.Err ?? "loopback failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

export const accessTokenForGmail = async (): Promise<string> => {
  const stored = await invoke<string | null>("read_secret", { name: refreshTokenKey });
  if (stored === null || stored.length === 0) {
    throw new Error("gmail is not connected");
  }
  const tokens = await refreshAccessToken(stored);
  return tokens.accessToken;
};
