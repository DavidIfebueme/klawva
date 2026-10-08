import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Schema from "effect/Schema";
import {
  sendMessage,
  startPayload,
  TelegramUpdate,
} from "../src/channels/telegram.ts";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("telegram send failures", () => {
  it("fails when both the formatted and the plain send fail", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("nope", { status: 500 })),
    );
    const outcome = await Effect.runPromise(
      Effect.result(sendMessage("token", 1, "hello")),
    );
    expect(outcome._tag).toBe("Failure");
  });

  it("succeeds when the plain text fallback lands", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", () => {
      calls += 1;
      return Promise.resolve(
        new Response(null, { status: calls === 1 ? 500 : 200 }),
      );
    });
    const outcome = await Effect.runPromise(
      Effect.result(sendMessage("token", 1, "hello")),
    );
    expect(outcome._tag).toBe("Success");
    expect(calls).toBe(2);
  });
});
