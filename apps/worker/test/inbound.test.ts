import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl, Param } from "../src/db/database.ts";
import type { Env } from "../src/env.ts";
import { fileInboundCall, provisionReceptionist } from "../src/voice/inbound.ts";
import { BolnaWebhookPayload, bolnaCallType } from "../src/voice/api.ts";

const env = {
  BOLNA_API_KEY: "bn_test",
  FRONTEND_BASE_URL: "https://klawva.example",
  CRON_SECRET: "cron",
  VOICE_WEBHOOK_SECRET: "secret",
} as Env;

const inboundDb = (existing: { id: string; sessionId: string } | null) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  let bound = existing;
  const db: DatabaseImpl = {
    all: () => Effect.succeed([]),
    first: (sql) => {
      const text = String(sql);
      if (text.includes("FROM inbound_lines")) {
        return Effect.succeed({
          listingId: "l1",
          agentSlug: "receptionist",
          brief: "{}",
        });
      }
      if (text.includes("FROM session_transports WHERE carrier_ref")) {
        return Effect.succeed(bound);
      }
      if (text.includes("FROM agent_listings l JOIN listing_versions")) {
        return Effect.succeed({ version: 1, budgetMinor: 450_000 });
      }
      return Effect.succeed(null);
    },
    run: (sql, params) => {
      const text = String(sql);
      writes.push({ sql: text, params: params ?? [] });
      if (text.includes("INSERT INTO session_transports")) {
        bound = { id: "t1", sessionId: "s1" };
      }
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

describe("inbound call filing", () => {
  it("creates one session, binds phone_in and files the transcript", async () => {
    const { db, writes } = inboundDb(null);
    const filed = await Effect.runPromise(
      fileInboundCall(db, {
        executionId: "exec-in-1",
        toNumber: "+18156243901",
        status: "completed",
        transcript: "assistant: hello. user: I need a plumber.",
        conversationDuration: 21,
      }),
    );
    expect(filed).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO sessions"))).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO session_transports"))).toBe(true);
    const report = writes.find((w) => w.sql.toUpperCase().includes("MISSION_REPORTS"));
    expect(report).toBeDefined();
    expect(String(report!.params[3])).toContain("plumber");
  });

  it("does not create a second session when the same execution replays", async () => {
    const { db, writes } = inboundDb({ id: "t1", sessionId: "s1" });
    const filed = await Effect.runPromise(
      fileInboundCall(db, {
        executionId: "exec-in-1",
        toNumber: "+18156243901",
        status: "completed",
        summary: "Existing call",
      }),
    );
    expect(filed).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO sessions"))).toBe(false);
    expect(writes.some((w) => w.sql.toUpperCase().includes("MISSION_REPORTS"))).toBe(true);
  });

  it("ignores a number with no inbound line", async () => {
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: () => Effect.void,
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const filed = await Effect.runPromise(
      fileInboundCall(db, {
        executionId: "exec-in-2",
        toNumber: "+15550000000",
        status: "completed",
      }),
    );
    expect(filed).toBe(false);
  });

  it("marks a silent call as no conversation", async () => {
    const { db, writes } = inboundDb(null);
    await Effect.runPromise(
      fileInboundCall(db, {
        executionId: "exec-in-3",
        toNumber: "+18156243901",
        status: "completed",
        conversationDuration: 0,
      }),
    );
    const report = writes.find((w) => w.sql.toUpperCase().includes("MISSION_REPORTS"));
    expect(report!.params[3]).toBe("Inbound call with no conversation.");
  });
});

describe("receptionist provisioning", () => {
  const provisionDb = () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () =>
        Effect.succeed({ id: "l1", slug: "receptionist" }),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    return { db, writes };
  };

  it("creates the agent, assigns the number and writes the line", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(`${init?.method ?? "GET"} ${String(url)}`);
        if (String(url).includes("/phone-numbers/all")) {
          return Response.json([{ id: "pn1", phone_number: "+18156243901" }]);
        }
        if (String(url).includes("/v2/agent/all")) {
          return Response.json([]);
        }
        if (String(url).includes("/v2/agent") && init?.method === "POST") {
          const body = Schema.decodeUnknownSync(
            Schema.Struct({
              agent_config: Schema.Struct({
                webhook_url: Schema.String,
                call_summary_enabled: Schema.Boolean,
              }),
            }),
          )(JSON.parse(String(init.body)));
          expect(body.agent_config.webhook_url).toContain("/api/voice/bolna/webhook?k=secret");
          expect(body.agent_config.call_summary_enabled).toBe(true);
          return Response.json({ agent_id: "a1" });
        }
        return Response.json({ id: "pn1" });
      }),
    );
    const { db, writes } = provisionDb();
    const result = await Effect.runPromise(provisionReceptionist(db, env));
    expect(result).toEqual({ agentId: "a1", number: "+18156243901", assigned: true });
    expect(urls.some((url) => url.startsWith("POST https://api.bolna.ai/inbound/setup"))).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO inbound_lines"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("patches the existing agent instead of creating another", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(`${init?.method ?? "GET"} ${String(url)}`);
        if (String(url).includes("/phone-numbers/all")) {
          return Response.json([{ id: "pn1", phone_number: "+18156243901" }]);
        }
        if (String(url).includes("/v2/agent/all")) {
          return Response.json([
            { id: "a1", agent_name: "Klavva Receptionist" },
          ]);
        }
        return Response.json({ id: "pn1" });
      }),
    );
    const { db } = provisionDb();
    const result = await Effect.runPromise(provisionReceptionist(db, env));
    expect(result.agentId).toBe("a1");
    expect(urls.some((url) => url.startsWith("PATCH https://api.bolna.ai/v2/agent/a1"))).toBe(true);
    expect(urls.some((url) => url === "POST https://api.bolna.ai/v2/agent")).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("bolna webhook shape", () => {
  it("reads call_type from telephony_data and ignores the rest of the payload", () => {
    const payload = Schema.decodeUnknownSync(BolnaWebhookPayload)({
      id: "exec-1",
      status: "completed",
      transcript: "assistant: hello",
      total_cost: 0.01,
      telephony_data: {
        call_type: "inbound",
        to_number: "+18156243901",
        from_number: "+2349066033744",
        recording_url: null,
      },
    });
    expect(bolnaCallType(payload)).toBe("inbound");
  });
});
