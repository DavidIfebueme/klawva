import { describe, expect, it } from "vitest";
import {
  firstCallVerdict,
  isValidNonce,
  isValidSpawnPort,
  killDecision,
  spawnPlan,
} from "../src/desktop/supervisor.ts";

describe("spawn handshake", () => {
  it("passes port and nonce by environment, never argv", () => {
    const plan = spawnPlan({ port: 43_210, nonce: "n".repeat(40), bundleId: "clicky", transport: "a2a-loopback" });
    expect(plan.env.KLAWVA_A2A_PORT).toBe("43210");
    expect(plan.env.KLAWVA_A2A_NONCE).toBe("n".repeat(40));
    expect(Object.keys(plan.env).some((key) => key.toLowerCase().includes("arg"))).toBe(false);
  });

  it("refuses a privileged or silly port and a short nonce", () => {
    expect(isValidSpawnPort(80)).toBe(false);
    expect(isValidSpawnPort(43_210)).toBe(true);
    expect(isValidNonce("short")).toBe(false);
    expect(isValidNonce("x".repeat(32))).toBe(true);
  });
});

describe("first call", () => {
  const ok = { expectedNonce: "abc", receivedNonce: "abc", peerAddress: "127.0.0.1" };

  it("accepts a loopback peer quoting the nonce", () => {
    expect(firstCallVerdict(ok)).toEqual({ ok: true });
  });

  it("refuses a missing or wrong nonce, so a port squatter cannot answer", () => {
    expect(firstCallVerdict({ ...ok, receivedNonce: null })).toEqual({ ok: false, reason: "nonce_missing" });
    expect(firstCallVerdict({ ...ok, receivedNonce: "nope" })).toEqual({ ok: false, reason: "nonce_mismatch" });
  });

  it("refuses a non-loopback peer", () => {
    expect(firstCallVerdict({ ...ok, peerAddress: "10.0.0.9" })).toEqual({ ok: false, reason: "peer_not_loopback" });
  });
});

describe("kill decisions", () => {
  it("kills a revoked version and a finished shift, nothing else", () => {
    expect(killDecision({ revokedVersion: "1.2.0", runningVersion: "1.2.0", shiftEnded: false })).toEqual({ kill: true, reason: "revoked" });
    expect(killDecision({ revokedVersion: null, runningVersion: "1.2.0", shiftEnded: true })).toEqual({ kill: true, reason: "shift_ended" });
    expect(killDecision({ revokedVersion: null, runningVersion: "1.2.0", shiftEnded: false })).toEqual({ kill: false, reason: "running" });
  });
});
