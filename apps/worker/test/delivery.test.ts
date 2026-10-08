import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import type { DatabaseImpl } from "../src/db/database.ts";
import {
  deliverCompletion,
  type CompletionSenders,
} from "../src/channels/delivery.ts";

const setup = (
  links: ReadonlyArray<{ channel: string; chatId: string }>,
): {
  db: DatabaseImpl;
  senders: CompletionSenders;
  sent: Array<{ channel: string; to: string }>;
} => {
  const sent: Array<{ channel: string; to: string }> = [];
  const claimed = new Set<string>();
  return {
    db: {
      all: () =>
        Effect.succeed(
          links.map((link) => ({ channel: link.channel, chatId: link.chatId })),
        ),
      first: () => Effect.succeed(null),
      run: () => Effect.void,
      batch: () => Effect.void,
      changed: (_sql, params) => {
        const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}`;
        if (claimed.has(key)) {
          return Effect.succeed(0);
        }
        claimed.add(key);
        return Effect.succeed(1);
      },
    },
    senders: {
      telegram: (chatId) => {
        sent.push({ channel: "telegram", to: chatId });
        return Effect.void;
      },
      slack: (team, channel) => {
        sent.push({ channel: "slack", to: `${team}:${channel}` });
        return Effect.void;
      },
      email: (address) => {
        sent.push({ channel: "email", to: address });
        return Effect.void;
      },
    },
    sent,
  };
};

const params = (
  db: DatabaseImpl,
  senders: CompletionSenders,
  email: string | null,
) => ({
  db,
  senders,
  sessionId: "s1",
  reportUrl: "https://klawva.xyz/report/s1?shareToken=abc",
  email,
});

describe("deliverCompletion", () => {
  it("delivers to every linked channel plus email", async () => {
    const { db, senders, sent } = setup([
      { channel: "telegram", chatId: "-100" },
      { channel: "slack", chatId: "team:C123" },
    ]);
    await Effect.runPromise(
      deliverCompletion(params(db, senders, "boss@example.com")),
    );
    expect(sent).toContainEqual({ channel: "email", to: "boss@example.com" });
    expect(sent).toContainEqual({ channel: "telegram", to: "-100" });
    expect(sent).toContainEqual({ channel: "slack", to: "team:C123" });
  });

  it("sends nothing on a second run", async () => {
    const { db, senders, sent } = setup([
      { channel: "telegram", chatId: "-100" },
    ]);
    const first = params(db, senders, "boss@example.com");
    await Effect.runPromise(deliverCompletion(first));
    const count = sent.length;
    expect(count).toBeGreaterThan(0);
    await Effect.runPromise(deliverCompletion(first));
    expect(sent.length).toBe(count);
  });

  it("skips email when the address is missing and skips channels without a sender", async () => {
    const { db, senders, sent } = setup([
      { channel: "discord", chatId: "guild:channel" },
      { channel: "slack", chatId: "no-team-separator" },
    ]);
    await Effect.runPromise(deliverCompletion(params(db, senders, null)));
    expect(sent).toEqual([]);
  });
});
