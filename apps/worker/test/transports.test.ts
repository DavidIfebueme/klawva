import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  canTransitionTransport,
  closeTransports,
  projectTransports,
  transitionTransport,
} from "../src/session/transports.ts";

type Writes = Array<{ readonly sql: string; readonly params: ReadonlyArray<Param> }>;

const fakeDb = (
  existing: ReadonlyArray<Row> = [],
): { db: DatabaseImpl; writes: Writes } => {
  const writes: Writes = [];
  const db: DatabaseImpl = {
    all: () => Effect.succeed(existing),
    first: () => Effect.succeed(existing[0] ?? null),
    run: (sql, params) => {
      writes.push({ sql, params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

describe("transport state machine", () => {
  it("walks the legal path and refuses shortcuts", () => {
    expect(canTransitionTransport("pending", "bound")).toBe(true);
    expect(canTransitionTransport("bound", "active")).toBe(true);
    expect(canTransitionTransport("active", "closed")).toBe(true);
    expect(canTransitionTransport("pending", "active")).toBe(false);
    expect(canTransitionTransport("closed", "active")).toBe(false);
  });

  it("fails an illegal transition instead of moving", async () => {
    const exit = await Effect.runPromiseExit(
      transitionTransport("pending", "active"),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("allows closing from any open state", () => {
    expect(canTransitionTransport("pending", "closed")).toBe(true);
    expect(canTransitionTransport("bound", "closed")).toBe(true);
    expect(canTransitionTransport("active", "closed")).toBe(true);
  });
});

describe("projectTransports", () => {
  it("inserts one capability row per declared type", async () => {
    const { db, writes } = fakeDb();
    await Effect.runPromise(
      projectTransports(db, "s1", ["phone_out", "phone_in", "phone_out"]),
    );
    const inserts = writes.filter((w) => w.sql.includes("INSERT INTO session_transports"));
    expect(inserts.length).toBe(2);
    expect(inserts[0].params[1]).toBe("s1");
  });

  it("does not duplicate rows on a repeated init", async () => {
    const { db, writes } = fakeDb([{ id: "t1" }]);
    await Effect.runPromise(projectTransports(db, "s1", ["phone_out"]));
    const inserts = writes.filter((w) => w.sql.includes("INSERT INTO session_transports"));
    expect(inserts.length).toBe(0);
  });
});

describe("closeTransports", () => {
  it("closes every open transport for the session", async () => {
    const { db, writes } = fakeDb();
    await Effect.runPromise(closeTransports(db, "s1"));
    expect(writes.length).toBe(1);
    expect(writes[0].sql).toContain("state != 'closed'");
    expect(writes[0].sql).not.toContain("type IN");
  });

  it("can close only the revoked device type", async () => {
    const { db, writes } = fakeDb();
    await Effect.runPromise(closeTransports(db, "s1", ["desktop"]));
    expect(writes[0].sql).toContain("type IN");
    expect(writes[0].params).toContain("desktop");
  });
});
