import { openSessionSocket, type SessionEvent } from "./session.ts";
import { ensureWorkspace, writeNote } from "./workspace.ts";

export const runEmployee = async (
  token: string,
  sessionId: string,
  slug: string,
  onEvent: (event: SessionEvent) => void,
): Promise<void> => {
  const workspace = await ensureWorkspace(slug);
  onEvent({ kind: "status", text: `workspace at ${workspace}` });
  const socket = await openSessionSocket(token, sessionId, (event) => {
    onEvent(event);
    if (event.kind === "text") {
      void writeNote(slug, "events.log", `${new Date().toISOString()} ${event.text}\n`);
    }
  });
  await socket.send(JSON.stringify({ action: "kickoff" }));
  onEvent({ kind: "status", text: "kickoff sent" });
};
