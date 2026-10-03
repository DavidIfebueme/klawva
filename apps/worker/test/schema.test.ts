import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { Session } from "../src/db/schema.ts";

const row = {
  id: "s1",
  listingId: "l1",
  listingVersion: 1,
  agentId: "scrapper",
  channel: "telegram",
  brief: '{"task":"watch prices"}',
  state: "active",
  customerEmail: null,
  windowStart: "2026-10-03T00:00:00.000Z",
  windowEnd: "2026-10-04T00:00:00.000Z",
  budgetMinor: 1500,
  spentMinor: 0,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};

describe("session row decode", () => {
  it("parses a stored row, including the JSON brief", () => {
    const session = Schema.decodeUnknownSync(Session)(row);
    expect(session.brief).toEqual({ task: "watch prices" });
    expect(session.state).toBe("active");
  });

  it("rejects an unknown state", () => {
    expect(() =>
      Schema.decodeUnknownSync(Session)({ ...row, state: "nonsense" }),
    ).toThrow();
  });
});
