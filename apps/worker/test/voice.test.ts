import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import type { CallHandle, Carrier } from "../src/voice/carrier.ts";
import { dialChecked } from "../src/voice/dial.ts";
import { fileBolnaReport, upsertConsent } from "../src/voice/api.ts";
import {
  budgetCoversCall,
  koboPerMinute,
  maxSecondsForBudget,
} from "../src/voice/ratecard.ts";
import { aiDisclosureLine, insideCallingWindow, isE164 } from "../src/voice/rules.ts";
import { Brief } from "../src/db/schema.ts";
import * as Schema from "effect/Schema";
import { signatureVerifiedApiPath } from "../src/lib/owner.ts";
import {
  TWIML_DEFAULT_SECONDS,
  TWIML_MAX_SECONDS,
  TWIML_MIN_SECONDS,
  clampRelaySeconds,
  twimlForCall,
} from "../src/voice/twiml.ts";

const fakeDb = (row: Row | null): DatabaseImpl => ({
  all: () => Effect.succeed(row !== null ? [row] : []),
  first: () => Effect.succeed(row),
  run: () => Effect.void,
  batch: () => Effect.void,
  changed: () => Effect.succeed(0),
});

const recordingCarrier = (): { carrier: Carrier; calls: Array<{ maxSeconds: number; welcomeMessage: string }> } => {
  const calls: Array<{ maxSeconds: number; welcomeMessage: string }> = [];
  const carrier: Carrier = {
    name: "bolna",
    dial: (params) => {
      calls.push({ maxSeconds: params.maxSeconds, welcomeMessage: params.welcomeMessage });
      return Effect.succeed({ carrier: "bolna", carrierRef: "ref1" } satisfies CallHandle);
    },
  };
  return { carrier, calls };
};

const consentedRow = { consentSource: "booking_form", consentedAt: "2026-10-01", dnc: 0 };
const base = {
  sessionId: "s1",
  to: "+15551234567",
  market: "us" as const,
  agentName: "Ada",
  script: "Book the caller into the next free slot.",
  brief: "calendar rules: 30 minute slots",
  budgetRemainingKobo: 450000,
  at: new Date(Date.UTC(2026, 9, 23, 17, 0, 0)),
};

describe("rate card", () => {
  it("converts carrier cents to kobo at the stored fx rate", () => {
    expect(koboPerMinute("bolna")).toBe(12000);
    expect(koboPerMinute("twilio")).toBe(34500);
    expect(koboPerMinute("wholesale")).toBe(9750);
  });

  it("computes the per call hard stop from the remaining budget", () => {
    expect(maxSecondsForBudget(450000, "bolna")).toBe(2250);
    expect(maxSecondsForBudget(450000, "twilio")).toBe(782);
  });

  it("refuses budgets that cannot cover a minute", () => {
    expect(budgetCoversCall(1000, "twilio")).toBe(false);
    expect(budgetCoversCall(450000, "twilio")).toBe(true);
  });
});

describe("calling windows", () => {
  it("allows us calls from 8am pacific to 9pm eastern", () => {
    expect(insideCallingWindow("us", new Date(Date.UTC(2026, 9, 23, 17, 0, 0)))).toBe(true);
    expect(insideCallingWindow("us", new Date(Date.UTC(2026, 9, 24, 1, 30, 0)))).toBe(true);
    expect(insideCallingWindow("us", new Date(Date.UTC(2026, 9, 23, 14, 0, 0)))).toBe(false);
    expect(insideCallingWindow("us", new Date(Date.UTC(2026, 9, 24, 2, 30, 0)))).toBe(false);
  });

  it("allows india calls inside 9am to 9pm ist", () => {
    expect(insideCallingWindow("in", new Date(Date.UTC(2026, 9, 23, 9, 0, 0)))).toBe(true);
    expect(insideCallingWindow("in", new Date(Date.UTC(2026, 9, 23, 15, 0, 0)))).toBe(true);
    expect(insideCallingWindow("in", new Date(Date.UTC(2026, 9, 23, 16, 0, 0)))).toBe(false);
  });

  it("allows nigeria calls inside 8am to 9pm wat", () => {
    expect(insideCallingWindow("ng", new Date(Date.UTC(2026, 9, 23, 12, 0, 0)))).toBe(true);
    expect(insideCallingWindow("ng", new Date(Date.UTC(2026, 9, 23, 22, 0, 0)))).toBe(false);
  });

  it("decodes the stored session brief from its json text", () => {
    const decoded = Schema.decodeUnknownOption(Brief)(
      JSON.stringify({ phone: "+15551234567" }),
    );
    expect(decoded._tag).toBe("Some");
    expect(decoded._tag === "Some" ? decoded.value.phone : "").toBe("+15551234567");
  });

  it("only accepts e164 numbers for a brief callee", () => {
    expect(isE164("+2349066033744")).toBe(true);
    expect(isE164("+15551234567")).toBe(true);
    expect(isE164("0803 123 4567")).toBe(false);
    expect(isE164("2349066033744")).toBe(false);
    expect(isE164("+0123456")).toBe(false);
  });
});

describe("gated dial", () => {
  it("dials a consented number inside the window with a computed hard stop", async () => {
    const { carrier, calls } = recordingCarrier();
    const handle = await Effect.runPromise(
      dialChecked(fakeDb(consentedRow), carrier, base),
    );
    expect(handle.carrierRef).toBe("ref1");
    expect(handle.maxSeconds).toBe(600);
    expect(calls.length).toBe(1);
  });

  it("refuses a number with no consent record", async () => {
    const { carrier, calls } = recordingCarrier();
    const exit = await Effect.runPromiseExit(dialChecked(fakeDb(null), carrier, base));
    expect(exit._tag).toBe("Failure");
    expect(calls.length).toBe(0);
  });

  it("refuses a number on the dnc list even with consent", async () => {
    const { carrier, calls } = recordingCarrier();
    const exit = await Effect.runPromiseExit(
      dialChecked(fakeDb({ ...consentedRow, dnc: 1 }), carrier, base),
    );
    expect(exit._tag).toBe("Failure");
    expect(calls.length).toBe(0);
  });

  it("refuses outside the calling window", async () => {
    const { carrier, calls } = recordingCarrier();
    const exit = await Effect.runPromiseExit(
      dialChecked(fakeDb(consentedRow), carrier, {
        ...base,
        at: new Date(Date.UTC(2026, 9, 23, 4, 0, 0)),
      }),
    );
    expect(exit._tag).toBe("Failure");
    expect(calls.length).toBe(0);
  });

  it("refuses when the budget cannot cover a minute", async () => {
    const { carrier, calls } = recordingCarrier();
    const exit = await Effect.runPromiseExit(
      dialChecked(fakeDb(consentedRow), carrier, { ...base, budgetRemainingKobo: 1000 }),
    );
    expect(exit._tag).toBe("Failure");
    expect(calls.length).toBe(0);
  });

  it("keeps every call under the ten minute cap", async () => {
    const { carrier, calls } = recordingCarrier();
    const handle = await Effect.runPromise(
      dialChecked(fakeDb(consentedRow), carrier, {
        ...base,
        budgetRemainingKobo: 100_000_000,
      }),
    );
    expect(handle.maxSeconds).toBe(600);
    expect(calls[0].maxSeconds).toBe(600);
  });

  it("does not spend a dial attempt when a gate refuses", async () => {
    const writes: string[] = [];
    const db: DatabaseImpl = {
      ...fakeDb(null),
      run: (sql) => {
        writes.push(String(sql));
        return Effect.void;
      },
    };
    const { carrier } = recordingCarrier();
    await Effect.runPromiseExit(dialChecked(db, carrier, base));
    expect(writes.some((sql) => sql.includes("attempt_count = attempt_count + 1"))).toBe(false);
  });

  it("counts one attempt when the carrier is dialled", async () => {
    const writes: string[] = [];
    const db: DatabaseImpl = {
      ...fakeDb(consentedRow),
      run: (sql) => {
        writes.push(String(sql));
        return Effect.void;
      },
    };
    const { carrier } = recordingCarrier();
    await Effect.runPromise(dialChecked(db, carrier, base));
    const attempts = writes.filter((sql) => sql.includes("attempt_count = attempt_count + 1"));
    expect(attempts.length).toBe(1);
  });

  it("opens with the ai disclosure line", async () => {
    const { carrier, calls } = recordingCarrier();
    await Effect.runPromise(dialChecked(fakeDb(consentedRow), carrier, base));
    expect(calls[0].welcomeMessage.startsWith(aiDisclosureLine)).toBe(true);
  });
});

describe("consent ingestion", () => {
  it("upserts a consent row per uploaded number", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    await Effect.runPromise(
      upsertConsent(db, {
        number: "+2349066033744",
        source: "booking_form",
        consentedAt: "2026-10-01T00:00:00Z",
      }),
    );
    expect(writes.length).toBe(1);
    expect(writes[0].sql.toUpperCase()).toContain("CONFLICT");
    expect(writes[0].params[0]).toBe("+2349066033744");
    expect(writes[0].params[1]).toBe("booking_form");
    expect(writes[0].params[2]).toBe("2026-10-01T00:00:00Z");
  });
});

describe("bolna transcript ingest", () => {
  const dbFor = (row: Row | null): { db: DatabaseImpl; writes: Array<{ sql: string; params: ReadonlyArray<Param> }> } => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    return {
      db: {
        all: () => Effect.succeed(row !== null ? [row] : []),
        first: () => Effect.succeed(row),
        run: (sql, params) => {
          writes.push({ sql: String(sql), params: params ?? [] });
          return Effect.void;
        },
        batch: () => Effect.void,
        changed: () => Effect.succeed(0),
      },
      writes,
    };
  };

  it("files a call report against the transport's session", async () => {
    const { db, writes } = dbFor({ id: "t1", sessionId: "s1" });
    const filed = await Effect.runPromise(
      fileBolnaReport(db, "exec-123", "call completed, slot booked"),
    );
    expect(filed).toBe(true);
    const reportWrite = writes.find((w) => w.sql.toUpperCase().includes("MISSION_REPORTS"));
    expect(reportWrite).toBeDefined();
    expect(reportWrite!.params[1]).toBe("s1");
    expect(reportWrite!.params[2]).toBe("t1");
    expect(reportWrite!.params[3]).toBe("call completed, slot booked");
  });

  it("returns false when the carrier ref is unknown", async () => {
    const { db } = dbFor(null);
    const filed = await Effect.runPromise(
      fileBolnaReport(db, "nope", "call completed"),
    );
    expect(filed).toBe(false);
  });
});

describe("bolna webhook payload mapping", () => {
  it("accepts bolna's execution shape: execution_id for the ref, transcript excerpt as the summary", async () => {
    const { db, writes } = (() => {
      const w: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
      return {
        db: {
          all: () => Effect.succeed([]),
          first: () => Effect.succeed({ id: "t1", sessionId: "s1" }),
          run: (sql: string, params?: ReadonlyArray<Param>) => {
            w.push({ sql, params: params ?? [] });
            return Effect.void;
          },
          batch: () => Effect.void,
          changed: () => Effect.succeed(0),
        } as DatabaseImpl,
        writes: w,
      };
    })();
    const transcript = "caller: book me thursday. agent: done, thursday at 3pm.";
    const filed = await Effect.runPromise(
      fileBolnaReport(db, "exec-99", transcript.slice(0, 500)),
    );
    expect(filed).toBe(true);
    const report = writes.find((w) => w.sql.toUpperCase().includes("MISSION_REPORTS"));
    expect(report!.params[3]).toContain("thursday");
    void writes;
  });
});

describe("twiml relay", () => {
  it("serves the disclosure and a named one way message", () => {
    const xml = twimlForCall(clampRelaySeconds("120"), "Klavva Appointment Setter");
    expect(xml).toContain("This call is from an AI employee");
    expect(xml).toContain("on behalf of Klavva Appointment Setter");
    expect(xml).toContain("cannot hold a conversation");
    expect(xml).toContain("<Hangup/>");
    expect(xml).not.toContain("<Pause");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("escapes the business name", () => {
    const xml = twimlForCall(30, "Ada & Sons <Ltd>");
    expect(xml).toContain("Ada &amp; Sons &lt;Ltd&gt;");
    expect(xml).not.toContain("<Ltd>");
  });

  it("clamps the stop so no caller pushes a call past the budget brake", () => {
    expect(clampRelaySeconds("99999")).toBe(TWIML_MAX_SECONDS);
    expect(clampRelaySeconds("1")).toBe(TWIML_MIN_SECONDS);
    expect(clampRelaySeconds("abc")).toBe(TWIML_DEFAULT_SECONDS);
    expect(clampRelaySeconds(null)).toBe(TWIML_DEFAULT_SECONDS);
    expect(clampRelaySeconds("1e3")).toBe(TWIML_DEFAULT_SECONDS);
    expect(clampRelaySeconds("120abc")).toBe(TWIML_DEFAULT_SECONDS);
  });

  it("lets the twiml route past the owner gate, since twilio verifies nothing but the url", () => {
    expect(signatureVerifiedApiPath("/api/voice/twiml")).toBe(true);
  });
});

describe("dial binds its transport", () => {
  it("binds the phone_out leg to the carrier ref after a successful dial", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: (sql) =>
        String(sql).startsWith("SELECT consent_source")
          ? Effect.succeed(consentedRow)
          : String(sql).startsWith("SELECT state AS state FROM session_transports")
            ? Effect.succeed({ state: "pending" })
            : Effect.succeed(null),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const { carrier } = recordingCarrier();
    const handle = await Effect.runPromise(dialChecked(db, carrier, base));
    expect(handle.carrierRef).toBe("ref1");
    const bind = writes.find((w) => w.sql.includes("SET state = 'bound'"));
    expect(bind).toBeDefined();
    expect(bind!.params[1]).toBe("ref1");
  });
});
