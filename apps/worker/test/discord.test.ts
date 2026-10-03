import { describe, expect, it } from "vitest";
import { pongFor } from "../src/channels/discord.ts";

describe("discord interactions", () => {
  it("answers a ping with a pong", () => {
    expect(pongFor('{"type":1}')).toBe('{"type":1}');
  });

  it("ignores non-ping and malformed bodies", () => {
    expect(pongFor('{"type":2}')).toBeNull();
    expect(pongFor("not json")).toBeNull();
  });
});
