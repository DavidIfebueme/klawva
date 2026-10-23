import WebSocket from "@tauri-apps/plugin-websocket";
import { workerBaseUrl } from "./config.ts";

export interface HiredSession {
  readonly id: string;
  readonly state: string;
  readonly listingName: string | null;
}

const isSessionRow = (
  value: unknown,
): value is { id: string; state: string; listingName: string | null } =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string" &&
  "state" in value &&
  typeof value.state === "string";

export const listHiredSessions = async (
  token: string,
): Promise<ReadonlyArray<HiredSession>> => {
  const response = await fetch(`${workerBaseUrl}/api/device/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`sessions failed with ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error("sessions returned an unexpected shape");
  }
  return body.filter(isSessionRow).map((row) => ({
    id: row.id,
    state: row.state,
    listingName: row.listingName,
  }));
};

export interface SessionEvent {
  readonly kind: string;
  readonly text: string;
}

export const openSessionSocket = async (
  token: string,
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
): Promise<WebSocket> => {
  const wsUrl = workerBaseUrl.replace(/^http/, "ws");
  const socket = await WebSocket.connect(
    `${wsUrl}/agents/session/${sessionId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  socket.addListener((message) => {
    if (message.type === "Text" && typeof message.data === "string") {
      onEvent({ kind: "text", text: message.data });
    } else if (message.type === "Close") {
      onEvent({ kind: "close", text: "" });
    }
  });
  return socket;
};
