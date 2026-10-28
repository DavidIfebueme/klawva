import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param } from "../src/db/database.ts";
import type { Env } from "../src/env.ts";
import { carrierForMarket, placePhoneHire } from "../src/voice/placement.ts";

const dbWith = (consent: { consentSource: string; consentedAt: string; dnc: number } | null) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const db = {
    all: () => Effect.succeed([]),
    first: (sql: string) =>
      String(sql).startsWith("SELECT consent_source")
        ? Effect.succeed(consent)
        : String(sql).startsWith("SELECT state AS state FROM session_transports")
          ? Effect.succeed({ state: "pending" })
          : Effect.succeed(null),
    run: (_sql: string, params?: ReadonlyArray<Param>) => {
      writes.push({ sql: String(_sql), params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  } as unknown as DatabaseImpl;
  return { db, writes };
};

const env = (over: Partial<Env> = {}): Env =>
  ({
    BOLNA_API_KEY: "bn_test",
    TWILIO_ACCOUNT_SID: "AC_test",
    TWILIO_AUTH_TOKEN: "tok",
    TWILIO_FROM_NUMBER: "+15550001111",
    VOICE_RELAY_URL: "https://klawva.xyz/api/voice/twiml",
    ...over,
  }) as unknown as Env;

const phone = { outbound: true, inbound: false, script: "Call about the booking." };
const base = {
  sessionId: "s1",
  agentName: "Ada",
  manifest: { phone },
  brief: {} as unknown,
  budgetRemainingKobo: 450_000,
};

const at = new Date(Date.UTC(2026, 9, 28, 15, 0, 0));

describe("carrier per market", () => {
  it("nigeria rides twilio and needs all four values", () => {
    expect(carrierForMarket(env(), "ng")?.name).toBe("twilio");
    expect(carrierForMarket(env({ TWILIO_FROM_NUMBER: undefined }), "ng")).toBeNull();
    expect(carrierForMarket(env({ VOICE_RELAY_URL: undefined }), "ng")).toBeNull();
  });

  it("us and india ride bolna, and a missing key refuses instead of dialing", () => {
    expect(carrierForMarket(env(), "us")?.name).toBe("bolna");
    expect(carrierForMarket(env(), "in")?.name).toBe("bolna");
    expect(carrierForMarket(env({ BOLNA_API_KEY: undefined }), "us")).toBeNull();
  });
});

describe("placing a phone hire", () => {
  it("refuses a listing with no phone block", async () => {
    const { db } = dbWith(null);
    const outcome = await Effect.runPromise(
      placePhoneHire(env(), db, { ...base, manifest: {} }, at),
    );
    expect(outcome.reason).toBe("no_phone_block");
  });

  it("an inbound-only listing never dials", async () => {
    const { db } = dbWith(null);
    const outcome = await Effect.runPromise(
      placePhoneHire(
        env(),
        db,
        { ...base, manifest: { phone: { ...phone, outbound: false, inbound: true } } },
        at,
      ),
    );
    expect(outcome.reason).toBe("inbound_only");
  });

  it("refuses when the brief carries no callee number", async () => {
    const { db } = dbWith(null);
    const outcome = await Effect.runPromise(
      placePhoneHire(env(), db, { ...base, brief: { task: "call them" } }, at),
    );
    expect(outcome.reason).toBe("no_callee");
  });

  it("refuses a number without consent, before any carrier call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { db } = dbWith(null);
    const outcome = await Effect.runPromise(
      placePhoneHire(env(), db, { ...base, brief: { phone: "+2349066033744" } }, at),
    );
    expect(outcome.dialed).toBe(false);
    expect(["no_consent", "outside_calling_window"].includes(outcome.reason ?? "")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("dials through twilio for a consented nigerian number and returns the ref", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ sid: "CA_test_1" }), { status: 200 });
      }),
    );
    const { db, writes } = dbWith({
      consentSource: "booking_form",
      consentedAt: "2026-10-01",
      dnc: 0,
    });
    const outcome = await Effect.runPromise(
      placePhoneHire(env(), db, { ...base, brief: { phone: "+2349066033744" } }, at),
    );
    expect(outcome.dialed).toBe(true);
    expect(outcome.carrier).toBe("twilio");
    expect(outcome.carrierRef).toBe("CA_test_1");
    expect(calls.some((url) => url.includes("api.twilio.com"))).toBe(true);
    expect(writes.some((w) => w.sql.includes("SET state = 'bound'"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("dials through bolna for a consented us number", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return url.includes("/v2/agent")
          ? new Response(JSON.stringify({ agent_id: "agent_1" }), { status: 200 })
          : new Response(JSON.stringify({ execution_id: "exec_1" }), { status: 200 });
      }),
    );
    const { db } = dbWith({ consentSource: "web_form", consentedAt: "2026-10-01", dnc: 0 });
    const outcome = await Effect.runPromise(
      placePhoneHire(env(), db, { ...base, brief: { phone: "+15551234567" } }, at),
    );
    expect(outcome.carrier).toBe("bolna");
    expect(outcome.carrierRef).toBe("exec_1");
    expect(urls.some((url) => url.includes("api.bolna.ai"))).toBe(true);
    vi.unstubAllGlobals();
  });
});
