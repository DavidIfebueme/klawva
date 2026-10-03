import { describe, expect, it } from "vitest";
import { buildMessages } from "../src/agent/runtime.ts";
import { isBlockedHost } from "../src/agent/tools.ts";

describe("prompt assembly", () => {
  it("keeps the soul and carries the brief as data", () => {
    const messages = buildMessages(
      "You are the Scrapper.",
      { task: "watch prices" },
      [{ role: "user", content: "go" }],
    );
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("You are the Scrapper.");
    expect(messages[0]?.content).toContain("task: watch prices");
    expect(messages.at(-1)).toEqual({ role: "user", content: "go" });
  });
});

describe("egress control", () => {
  it("blocks private and metadata hosts", () => {
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("10.0.0.5")).toBe(true);
    expect(isBlockedHost("192.168.1.1")).toBe(true);
    expect(isBlockedHost("metadata.internal")).toBe(true);
  });

  it("allows public hosts", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("api.telegram.org")).toBe(false);
  });
});
