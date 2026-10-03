import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { startPayload, TelegramUpdate } from "../src/channels/telegram.ts";

describe("telegram update parsing", () => {
  it("decodes a message update", () => {
    const update = Schema.decodeUnknownSync(TelegramUpdate)({
      update_id: 1,
      message: { message_id: 2, chat: { id: 42 }, text: "/start abc" },
    });
    expect(update.message?.chat.id).toBe(42);
  });

  it("extracts the start payload", () => {
    expect(startPayload("/start abc")).toBe("abc");
    expect(startPayload("/start")).toBeNull();
    expect(startPayload("hello")).toBeNull();
  });
});
