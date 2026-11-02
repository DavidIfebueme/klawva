import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import { definitions } from "../listings/definitions.ts";
import { fileCallReport } from "../report/report.ts";
import { insertSessionRow } from "../session/create.ts";
import { bindTransport } from "../session/transports.ts";
import { ListingConflict } from "../errors.ts";
import { aiDisclosureLine } from "./rules.ts";
import { bolnaWebhookUrl } from "./placement.ts";

export const receptionistNumber = "+18156243901";
export const receptionistAgentName = "Klavva Receptionist";

export const receptionistDemoBrief = {
  business_facts:
    "Klavva hires AI employees. The site is klawva.xyz. Prices are in naira. The team replies by email.",
  calendar_rules: "No bookings. Take a message and say the team will reply.",
  escalation_contact:
    "Say you will pass the message to the Klavva team. Do not invent an email address or phone number.",
} as const;

export interface ProvisionEnv {
  readonly BOLNA_API_KEY?: string;
  readonly FRONTEND_BASE_URL?: string;
  readonly CRON_SECRET?: string;
}

export interface ProvisionResult {
  readonly agentId: string;
  readonly number: string;
  readonly assigned: boolean;
}

const BolnaAgentRow = Schema.Struct({
  id: Schema.String,
  agent_name: Schema.String,
});

const BolnaNumberRow = Schema.Struct({
  id: Schema.String,
  phone_number: Schema.String,
});

const BolnaAgentCreated = Schema.Struct({ agent_id: Schema.String });

const bolnaError = (cause: unknown): ListingConflict =>
  new ListingConflict({ reason: String(cause) });

const bolnaFetch = async (
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<unknown> => {
  const response = await fetch(`https://api.bolna.ai${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`bolna ${path} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
};

const agentConfigFor = (webhookUrl: string) => ({
  agent_name: receptionistAgentName,
  agent_welcome_message: `${aiDisclosureLine} You have reached Klavva. How can I help?`,
  call_summary_enabled: true,
  webhook_url: webhookUrl,
  tasks: [
    {
      task_type: "conversation",
      toolchain: {
        execution: "sequential",
        pipelines: [["transcriber", "llm", "synthesizer"]],
      },
      tools_config: {
        llm_agent: {
          agent_type: "simple_llm_agent",
          agent_flow_type: "streaming",
          llm_config: {
            provider: "openai",
            model: "gpt-4.1-mini",
            max_tokens: 150,
            temperature: 0.4,
          },
        },
        synthesizer: {
          provider: "elevenlabs",
          provider_config: {
            model: "eleven_turbo_v2_5",
            voice: "Angelica",
            voice_id: "IkSv4tkouLJ6kYsQA7XD",
          },
          stream: true,
          buffer_size: 250,
          audio_format: "wav",
        },
        transcriber: {
          provider: "deepgram",
          model: "nova-3",
          language: "en",
          stream: true,
          encoding: "linear16",
          sampling_rate: 16000,
          endpointing: 250,
        },
        input: { provider: "twilio", format: "wav" },
        output: { provider: "twilio", format: "wav" },
      },
      task_config: {
        call_terminate: 600,
        hangup_after_silence: 15,
        inbound_limit: -1,
        check_if_user_online: true,
      },
    },
  ],
});

const promptFor = (): string => {
  const script =
    definitions.find((definition) => definition.slug === "receptionist")?.phone
      ?.script ?? "You answer the business line.";
  const facts = Object.entries(receptionistDemoBrief)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
    .join("\n");
  return `${script}\n\nFacts for this line:\n${facts}`;
};

export const provisionReceptionist = (
  db: DatabaseImpl,
  env: ProvisionEnv,
): Effect.Effect<ProvisionResult, ListingConflict> =>
  Effect.gen(function* () {
    const apiKey = env.BOLNA_API_KEY ?? "";
    if (apiKey.length === 0) {
      return yield* Effect.fail(new ListingConflict({ reason: "bolna_not_configured" }));
    }
    const webhookUrl = bolnaWebhookUrl(env);
    if (webhookUrl.length === 0) {
      return yield* Effect.fail(new ListingConflict({ reason: "webhook_not_configured" }));
    }
    const listing = yield* db
      .first(
        "SELECT id AS id, slug AS slug FROM agent_listings WHERE slug = 'receptionist' AND status = 'published'",
        [],
      )
      .pipe(Effect.orDie);
    if (listing === null) {
      return yield* Effect.fail(new ListingConflict({ reason: "receptionist_listing_missing" }));
    }
    const numbers = yield* Effect.tryPromise({
      try: async () =>
        Schema.decodeUnknownSync(Schema.Array(BolnaNumberRow))(
          await bolnaFetch(apiKey, "/phone-numbers/all", { method: "GET" }),
        ),
      catch: bolnaError,
    });
    const numberRow = numbers.find(
      (row) => row.phone_number === receptionistNumber,
    );
    if (numberRow === undefined) {
      return yield* Effect.fail(new ListingConflict({ reason: "number_not_on_bolna" }));
    }
    const agents = yield* Effect.tryPromise({
      try: async () =>
        Schema.decodeUnknownSync(Schema.Array(BolnaAgentRow))(
          await bolnaFetch(apiKey, "/v2/agent/all", { method: "GET" }),
        ),
      catch: bolnaError,
    });
    const existing = agents.find(
      (row) => row.agent_name === receptionistAgentName,
    );
    const agentId = yield* Effect.tryPromise({
      try: async () => {
        const body = JSON.stringify({
          agent_config: agentConfigFor(webhookUrl),
          agent_prompts: { task_1: { system_prompt: promptFor() } },
        });
        if (existing === undefined) {
          const created = Schema.decodeUnknownSync(BolnaAgentCreated)(
            await bolnaFetch(apiKey, "/v2/agent", { method: "POST", body }),
          );
          return created.agent_id;
        }
        await bolnaFetch(apiKey, `/v2/agent/${existing.id}`, {
          method: "PATCH",
          body,
        });
        return existing.id;
      },
      catch: bolnaError,
    });
    const assigned = yield* Effect.tryPromise({
      try: async () => {
        await bolnaFetch(apiKey, "/inbound/setup", {
          method: "POST",
          body: JSON.stringify({
            agent_id: agentId,
            phone_number_id: numberRow.id,
          }),
        });
        return true;
      },
      catch: bolnaError,
    }).pipe(Effect.catch(() => Effect.succeed(false)));
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO inbound_lines (number, listing_id, agent_slug, bolna_agent_id, brief, owner_user_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?) ON CONFLICT(number) DO UPDATE SET listing_id = excluded.listing_id, agent_slug = excluded.agent_slug, bolna_agent_id = excluded.bolna_agent_id, brief = excluded.brief, active = 1, updated_at = excluded.updated_at",
        [
          receptionistNumber,
          String(listing.id),
          String(listing.slug),
          agentId,
          JSON.stringify(receptionistDemoBrief),
          now,
          now,
        ],
      )
      .pipe(Effect.orDie);
    return { agentId, number: receptionistNumber, assigned };
  });

export interface InboundCall {
  readonly executionId: string;
  readonly toNumber: string;
  readonly status: string;
  readonly summary?: string;
  readonly transcript?: string;
  readonly conversationDuration?: number;
}

const callSummary = (call: InboundCall): string =>
  call.summary ??
  (call.transcript !== undefined && call.transcript.length > 0
    ? call.transcript.slice(0, 500)
    : call.conversationDuration === 0
      ? "Inbound call with no conversation."
      : "Inbound call completed.");

const writeReport = (
  db: DatabaseImpl,
  sessionId: string,
  transportId: string,
  call: InboundCall,
): Effect.Effect<void> =>
  fileCallReport(db, sessionId, transportId, {
    outcome:
      call.conversationDuration === undefined || call.conversationDuration > 0
        ? "complete"
        : "partial",
    summary: callSummary(call),
    stats: [
      { label: "call", value: call.executionId },
      { label: "direction", value: "inbound" },
    ],
  });

export const fileInboundCall = (
  db: DatabaseImpl,
  call: InboundCall,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const line = yield* db
      .first(
        "SELECT listing_id AS listingId, agent_slug AS agentSlug, brief AS brief FROM inbound_lines WHERE number = ? AND active = 1",
        [call.toNumber],
      )
      .pipe(Effect.orDie);
    if (line === null) {
      yield* Effect.logInfo(`voice.inbound.unknown_line ${call.toNumber}`);
      return false;
    }
    const existing = yield* db
      .first(
        "SELECT id AS id, session_id AS sessionId FROM session_transports WHERE carrier_ref = ? AND type = 'phone_in' LIMIT 1",
        [call.executionId],
      )
      .pipe(Effect.orDie);
    if (existing !== null) {
      yield* writeReport(db, String(existing.sessionId), String(existing.id), call);
      return true;
    }
    const listing = yield* db
      .first(
        "SELECT l.current_version AS version, v.budget_minor AS budgetMinor FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ? AND l.status = 'published'",
        [String(line.listingId)],
      )
      .pipe(Effect.orDie);
    if (listing === null) {
      yield* Effect.logInfo(`voice.inbound.listing_missing ${String(line.listingId)}`);
      return false;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 86_400_000).toISOString();
    const sessionId = yield* insertSessionRow(db, {
      userId: null,
      listingId: String(line.listingId),
      listingVersion: Number(listing.version),
      agentId: String(line.agentSlug),
      channel: "web",
      brief: String(line.brief),
      customerEmail: null,
      budgetMinor: Number(listing.budgetMinor),
      durationDays: 1,
      state: "active",
      windowStart: now.toISOString(),
      windowEnd: end,
    });
    const bound = yield* bindTransport(
      db,
      sessionId,
      "phone_in",
      "bolna",
      call.executionId,
    ).pipe(
      Effect.as(true),
      Effect.catchCause(() => Effect.succeed(false)),
    );
    if (!bound) {
      const raced = yield* db
        .first(
          "SELECT id AS id, session_id AS sessionId FROM session_transports WHERE carrier_ref = ? AND type = 'phone_in' LIMIT 1",
          [call.executionId],
        )
        .pipe(Effect.orDie);
      if (raced === null) {
        return false;
      }
      yield* writeReport(db, String(raced.sessionId), String(raced.id), call);
      return true;
    }
    const transport = yield* db
      .first(
        "SELECT id AS id FROM session_transports WHERE carrier_ref = ? AND type = 'phone_in' LIMIT 1",
        [call.executionId],
      )
      .pipe(Effect.orDie);
    if (transport === null) {
      return false;
    }
    yield* writeReport(db, sessionId, String(transport.id), call);
    return true;
  });
