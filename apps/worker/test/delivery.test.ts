import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import type { DatabaseImpl } from "../src/db/database.ts";
import {
  deliverCompletion,
  DeliveryError,
  type CompletionSenders,
} from "../src/channels/delivery.ts";

interface Row {
  readonly sessionId: string;
  readonly channel: string;
  readonly chatId: string;
  createdAt: string;
  deliveredAt: string | null;
}

const store = (
  links: ReadonlyArray<{ channel: string; chatId: string }>,
  failFirst: boolean,
): {
  db: DatabaseImpl;
  rows: Row[];
  senders: CompletionSenders;
  sent: string[];
} => {
  const rows: Row[] = [];
  const sent: string[] = [];
  let attempts = 0;
  const fail = (channel: string): Effect.Effect<void, DeliveryError> =>
    Effect.fail(new DeliveryError({ channel, reason: "boom" }));

  const key = (sessionId: unknown, channel: unknown, chatId: unknown) =>
    `${sessionId}|${channel}|${chatId}`;

  return {
    rows,
    sent,
    db: {
      all: () =>
        Effect.succeed(
          links.map((link) => ({ channel: link.channel, chatId: link.chatId })),
        ),
      first: (_sql, params) => {
        const found = rows.find(
          (row) => key(row.sessionId, row.channel, row.chatId) === key(params?.[0], params?.[1], params?.[2]),
        );
        return Effect.succeed(
          found === undefined
            ? null
            : { deliveredAt: found.deliveredAt, createdAt: found.createdAt },
        );
      },
      run: (sql, params) => {
        if (sql.startsWith("DELETE")) {
          const match = key(params?.[0], params?.[1], params?.[2]);
          const at = rows.findIndex(
            (row) => key(row.sessionId, row.channel, row.chatId) === match,
          );
          if (at >= 0) {
            rows.splice(at, 1);
          }
          return Effect.void;
        }
        const match = key(params?.[1], params?.[2], params?.[3]);
        const row = rows.find(
          (r) => key(r.sessionId, r.channel, r.chatId) === match,
        );
        if (row !== undefined) {
          row.deliveredAt = String(params?.[0]);
        }
        return Effect.void;
      },
      changed: (_sql, params) => {
        const match = key(params?.[0], params?.[1], params?.[2]);
        if (rows.some((row) => key(row.sessionId, row.channel, row.chatId) === match)) {
          return Effect.succeed(0);
        }
        rows.push({
          sessionId: String(params?.[0]),
          channel: String(params?.[1]),
          chatId: String(params?.[2]),
          createdAt: String(params?.[3]),
          deliveredAt: null,
        });
        return Effect.succeed(1);
      },
      batch: () => Effect.void,
    },
    senders: {
      telegram: (chatId) => {
        attempts += 1;
        if (failFirst && attempts === 1) {
          return fail("telegram");
        }
        sent.push(`telegram:${chatId}`);
        return Effect.void;
      },
      slack: (_team, channel) => {
        sent.push(`slack:${channel}`);
        return Effect.void;
      },
      email: (address) => {
        sent.push(`email:${address}`);
        return Effect.void;
      },
    },
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
    const { db, senders, sent } = store(
      [
        { channel: "telegram", chatId: "-100" },
        { channel: "slack", chatId: "team:C123" },
      ],
      false,
    );
    await Effect.runPromise(
      deliverCompletion(params(db, senders, "boss@example.com")),
    );
    expect(sent).toContainEqual("email:boss@example.com");
    expect(sent).toContainEqual("telegram:-100");
    expect(sent).toContainEqual("slack:C123");
  });

  it("sends nothing on a second run after a successful delivery", async () => {
    const { db, senders, sent } = store(
      [{ channel: "telegram", chatId: "-100" }],
      false,
    );
    const first = params(db, senders, "boss@example.com");
    await Effect.runPromise(deliverCompletion(first));
    const count = sent.length;
    await Effect.runPromise(deliverCompletion(first));
    expect(count).toBeGreaterThan(0);
    expect(sent.length).toBe(count);
  });

  it("releases the claim after a failed send so a later run retries", async () => {
    const { db, senders, sent, rows } = store(
      [{ channel: "telegram", chatId: "-100" }],
      true,
    );
    const first = params(db, senders, null);
    await Effect.runPromise(deliverCompletion(first));
    expect(sent).toEqual([]);
    expect(rows).toEqual([]);
    await Effect.runPromise(deliverCompletion(first));
    expect(sent).toEqual(["telegram:-100"]);
  });

  it("keeps the receipt after a successful delivery", async () => {
    const { db, senders, rows } = store(
      [{ channel: "telegram", chatId: "-100" }],
      false,
    );
    await Effect.runPromise(
      deliverCompletion(params(db, senders, "boss@example.com")),
    );
    expect(rows.length).toBe(2);
    expect(rows.every((row) => row.deliveredAt !== null)).toBe(true);
  });
});
