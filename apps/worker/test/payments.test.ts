import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../src/db/database.ts";
import { windowEndFor } from "../src/payments/pricing.ts";
import {
  handlePaystackWebhook,
  type PaystackEnv,
  signBody,
  verifySignature,
} from "../src/payments/paystack.ts";

describe("paystack signature", () => {
  it("verifies a body signed with the secret", async () => {
    const body = '{"event":"charge.success","data":{"reference":"r1"}}';
    const signature = await Effect.runPromise(
      signBody(body, "sk_test_example"),
    );
    const valid = await Effect.runPromise(
      verifySignature(body, "sk_test_example", signature),
    );
    const invalid = await Effect.runPromise(
      verifySignature(body, "sk_test_example", "deadbeef"),
    );
    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });
});

describe("paystack webhook", () => {
  const secret = "sk_test_example";
  const confirmedAt = "2026-01-01T00:00:00.000Z";

  const signedWebhook = async (): Promise<Request> => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "klawva_s1_1" },
    });
    const signature = await Effect.runPromise(signBody(body, secret));
    return new Request("https://klawva.test/paystack", {
      method: "POST",
      headers: { "x-paystack-signature": signature },
      body,
    });
  };

  const envCapturingWindow = (windows: Array<string>): PaystackEnv => ({
    PAYSTACK_SECRET_KEY: secret,
    SESSION: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (_url: string, init: { readonly body?: string }) => {
          const raw = init.body ?? "";
          const body: unknown = raw.length > 0 ? JSON.parse(raw) : {};
          const decoded = Schema.decodeUnknownOption(
            Schema.Struct({ windowEnd: Schema.String }),
          )(body);
          windows.push(decoded._tag === "Some" ? decoded.value.windowEnd : "");
          return Response.json({ state: "active", newlyActivated: false });
        },
      }),
    },
    WALLET: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => Response.json({ ok: true }) }),
    },
    BREVO_API_KEY: "",
    BREVO_SENDER_EMAIL: "",
  });

  const dbForConfirmedPayment = (
    statements: Array<string>,
  ): DatabaseImpl => ({
    all: () => Effect.succeed([]),
    first: (sql) => {
      statements.push(sql);
      return Effect.succeed({
        session_id: "s1",
        amount_minor: 5000,
        status: "confirmed",
        confirmed_at: confirmedAt,
        duration_days: 1,
      });
    },
    run: (sql) => {
      statements.push(sql);
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  });

  it("holds the deadline the first confirmation set", async () => {
    const windows: Array<string> = [];
    const statements: Array<string> = [];

    const response = await Effect.runPromise(
      handlePaystackWebhook(
        await signedWebhook(),
        envCapturingWindow(windows),
        dbForConfirmedPayment(statements),
      ),
    );

    expect(response.status).toBe(200);
    expect(windows).toEqual([windowEndFor(Date.parse(confirmedAt), 1)]);
    expect(statements.join(" ")).not.toContain("UPDATE payments");
  });
});
