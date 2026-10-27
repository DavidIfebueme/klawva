import { newPairCode, waitForClaim } from "./client/pairing.ts";
import { verifyMode, workerBaseUrl } from "./client/config.ts";
import { listHiredSessions, type HiredSession } from "./client/session.ts";
import { runEmployee } from "./client/loop.ts";
import type { SessionEvent } from "./client/session.ts";

const statusEl = document.getElementById("status");
const codeEl = document.getElementById("pair-code");
const startButton = document.getElementById("start-pair");
const pairCard = document.getElementById("pair-card");
const sessionsCard = document.getElementById("sessions-card");
const sessionsList = document.getElementById("sessions");

const say = (line: string): void => {
  if (statusEl !== null) {
    statusEl.textContent = `${statusEl.textContent}\n${line}`;
  }
};

const onEvent = (event: SessionEvent): void => {
  say(`[${event.kind}] ${event.text.slice(0, 160)}`);
};

const showSessions = (sessions: ReadonlyArray<HiredSession>, token: string): void => {
  if (sessionsCard === null || sessionsList === null) {
    return;
  }
  sessionsCard.hidden = false;
  sessionsList.innerHTML = "";
  for (const session of sessions) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.textContent = `run ${session.listingName ?? session.id}`;
    button.addEventListener("click", () => {
      const slug = (session.listingName ?? "employee").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      void runEmployee(token, session.id, slug, onEvent).catch((error: unknown) => {
        say(`run failed: ${String(error)}`);
      });
    });
    item.appendChild(button);
    sessionsList.appendChild(item);
  }
};

startButton?.addEventListener("click", () => {
  const code = newPairCode();
  if (codeEl !== null) {
    codeEl.textContent = code;
  }
  say("code shown. approve it on the site, this window waits.");
  waitForClaim(code, (seconds) => {
    if (seconds % 30 === 0 && seconds > 0) {
      say(`still waiting, ${seconds}s`);
    }
  })
    .then(async (claimed) => {
      say("paired. loading your hires.");
      localStorage.setItem(
        "klawva.device",
        JSON.stringify({ ...claimed, pairedAt: new Date().toISOString() }),
      );
      const sessions = await listHiredSessions(claimed.token);
      showSessions(sessions, claimed.token);
      pairCard?.setAttribute("hidden", "true");
    })
    .catch((error: unknown) => {
      say(`pairing failed: ${String(error)}`);
    });
});

const isStoredDevice = (value: unknown): value is { deviceId: string; token: string } =>
  typeof value === "object" &&
  value !== null &&
  "deviceId" in value &&
  typeof value.deviceId === "string" &&
  "token" in value &&
  typeof value.token === "string";

const stored = localStorage.getItem("klawva.device");
if (stored !== null) {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stored);
  } catch {
    localStorage.removeItem("klawva.device");
  }
  if (isStoredDevice(parsed)) {
    const claimed = parsed;
    say("device found. loading your hires.");
    listHiredSessions(claimed.token)
      .then((sessions) => showSessions(sessions, claimed.token))
      .catch(() => {
        localStorage.removeItem("klawva.device");
        say("stored device was revoked. pair again.");
      });
  } else {
    localStorage.removeItem("klawva.device");
  }
}


const reportVerify = async (line: string, exitCode?: number): Promise<void> => {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("verify_report", { line, exitCode: exitCode ?? null });
  } catch {
    console.log(line);
  }
  if (exitCode !== undefined) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("verify_exit", { code: exitCode });
  }
};

if (verifyMode(window.location.search)) {
  void (async () => {
    await reportVerify(`worker=${workerBaseUrl}`);
    const code = newPairCode();
    await reportVerify(`code=${code}`);
    try {
      const claimed = await waitForClaim(code, () => {}, 120);
      await reportVerify(`paired=${claimed.deviceId}`);
      await reportVerify("verify ok", 0);
    } catch (cause) {
      await reportVerify(`verify failed: ${String(cause)}`, 1);
    }
  })();
}
