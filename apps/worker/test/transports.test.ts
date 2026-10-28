import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  canTransitionTransport,
  bindTransport,
  closeTransports,
  projectTransports,
  transitionTransport,
} from "../src/session/transports.ts";

type Writes = Array<{ readonly sql: string; readonly params: ReadonlyArray<Param> }>;

const fakeDb = (
  existing: ReadonlyArray<Row> = [],
): { db: DatabaseImpl; writes: Writes } => {
  const writes: Writes = [];
  const visible = (sql: string, params: ReadonlyArray<Param> = []): ReadonlyArray<Row> => {
    let rows = existing;
    if (sql.includes("carrier_ref IS NULL")) {
      rows = rows.filter((row) => row.carrierRef === null || row.carrierRef === undefined);
    }
    if (sql.includes("carrier_ref = ?")) {
      rows = rows.filter((row) => row.carrierRef === params[2]);
    }
    return rows;
  };
  const db: DatabaseImpl = {
    all: (sql, params) => Effect.succeed(visible(String(sql), params ?? [])),
    first: (sql, params) => Effect.succeed(visible(String(sql), params ?? [])[0] ?? null),
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

describe("bindTransport call legs", () => {
  it("binds the pending capability row for the first call", async () => {
    const { db, writes } = fakeDb([{ state: "pending" }]);
    await Effect.runPromise(bindTransport(db, "s1", "phone_out", "bolna", "exec-1"));
    const bind = writes.find((w) => w.sql.includes("SET state = 'bound'"));
    expect(bind).toBeDefined();
  });

  it("creates a fresh bound row for the second call, since the capability row is already consumed", async () => {
    const { db, writes } = fakeDb([{ state: "bound", carrierRef: "exec-1" }]);
    await Effect.runPromise(bindTransport(db, "s1", "phone_out", "bolna", "exec-2"));
    const insert = writes.find((w) => w.sql.includes("INSERT INTO session_transports"));
    expect(insert).toBeDefined();
    expect(insert!.params[4]).toBe("exec-2");
  });
});

describe("device connect binding", () => {
  it("binds the desktop transport with the device as its carrier ref", async () => {
    const { db, writes } = fakeDb([{ state: "pending" }]);
    await Effect.runPromise(bindTransport(db, "s1", "desktop", "device", "d1"));
    const bind = writes.find((w) => w.sql.includes("SET state = 'bound'"));
    expect(bind).toBeDefined();
    expect(bind!.params[0]).toBe("device");
    expect(bind!.params[1]).toBe("d1");
  });
});

describe("reconnect does not stack rows", () => {
  it("a second connect with the same carrier ref updates the existing bound row", async () => {
    const { db, writes } = fakeDb([
      { state: "bound", carrierRef: "d1" },
    ]);
    await Effect.runPromise(bindTransport(db, "s1", "desktop", "device", "d1"));
    expect(writes.some((w) => w.sql.includes("INSERT INTO session_transports"))).toBe(false);
    expect(writes.some((w) => w.sql.includes("SET state = 'bound', updated_at"))).toBe(true);
  });
});
