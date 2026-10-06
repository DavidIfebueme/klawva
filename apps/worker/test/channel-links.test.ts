import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { linkChannel, unlinkChannel } from "../src/account/account.ts";
import type { DatabaseImpl, Param, Statement } from "../src/db/database.ts";

const recorder = (): {
  readonly db: DatabaseImpl;
  readonly ran: ReadonlyArray<{ sql: string; params: ReadonlyArray<Param> }>;
  readonly batched: ReadonlyArray<Statement>;
} => {
  const ran: { sql: string; params: ReadonlyArray<Param> }[] = [];
  const batched: Statement[] = [];
  return {
    db: {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: (sql, params) => {
        ran.push({ sql, params: params ?? [] });
        return Effect.void;
      },
      batch: (statements) => {
        batched.push(...statements);
        return Effect.void;
      },
    },
    ran,
    batched,
  };
};

describe("channel link", () => {
  it("leaves an existing unlinked row unlinked", async () => {
    const { db, ran } = recorder();
    await Effect.runPromise(linkChannel(db, "s1", "slack", "team:general"));
    expect(ran).toHaveLength(1);
    const [statement] = ran;
    expect(statement?.sql).toContain("ON CONFLICT(channel, chat_id, session_id)");
    expect(statement?.sql).toContain("DO UPDATE SET updated_at");
    expect(statement?.sql).not.toContain("status = 'linked'");
  });

  it("writes the link against the right channel", async () => {
    const { db, ran } = recorder();
    await Effect.runPromise(linkChannel(db, "s1", "telegram", "-100"));
    expect(ran[0]?.params).toEqual([
      expect.any(String),
      "s1",
      "telegram",
      "-100",
      expect.any(String),
      expect.any(String),
    ]);
  });
});

describe("channel unlink", () => {
  it("clears one chat and its active row in a single batch", async () => {
    const { db, batched } = recorder();
    await Effect.runPromise(
      unlinkChannel(db, "s1", "slack", "team:general"),
    );
    expect(batched).toHaveLength(2);
    const [markLink, clearActive] = batched;
    expect(markLink?.sql).toContain("UPDATE channel_links");
    expect(markLink?.sql).toContain("status = 'unlinked'");
    expect(markLink?.params).toEqual([
      expect.any(String),
      "s1",
      "slack",
      "team:general",
    ]);
    expect(clearActive?.sql).toContain("DELETE FROM chat_active_session");
    expect(clearActive?.params).toEqual(["s1", "slack", "team:general"]);
  });
});