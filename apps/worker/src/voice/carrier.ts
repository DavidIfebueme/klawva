import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { CarrierName } from "./ratecard.ts";
import type { Market } from "./rules.ts";

export class CarrierError extends Schema.TaggedError<CarrierError>()(
  "CarrierError",
  {
    carrier: Schema.String,
    reason: Schema.String,
  },
) {}

export interface DialParams {
  readonly to: string;
  readonly market: Market;
  readonly agentName: string;
  readonly script: string;
  readonly welcomeMessage: string;
  readonly maxSeconds: number;
}

export interface CallHandle {
  readonly carrier: CarrierName;
  readonly carrierRef: string;
}

export interface Carrier {
  readonly name: CarrierName;
  readonly dial: (params: DialParams) => Effect.Effect<CallHandle, CarrierError>;
}

export interface BolnaConfig {
  readonly apiKey: string;
}

export const bolnaCarrier = (config: BolnaConfig): Carrier => ({
  name: "bolna",
  dial: (params) =>
    Effect.tryPromise({
      try: async () => {
        if (config.apiKey.length === 0) {
          throw new Error("bolna_not_configured");
        }
        const agentResponse = await fetch("https://api.bolna.ai/v2/agent", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_config: {
              agent_name: params.agentName,
              agent_welcome_message: params.welcomeMessage,
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
                        max_tokens: 90,
                        temperature: 0.4,
                      },
                    },
                    synthesizer: {
                      provider: "azure",
                      provider_config: {
                        voice_name: "en-US-AvaNeural",
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
                    input: { provider: "default", format: "wav" },
                    output: { provider: "default", format: "wav" },
                  },
                  task_config: {
                    call_terminate: params.maxSeconds,
                    hangup_after_silence: 15,
                  },
                },
              ],
            },
            agent_prompts: { task_1: { system_prompt: params.script } },
          }),
        });
        if (!agentResponse.ok) {
          throw new Error(`bolna agent ${agentResponse.status}`);
        }
        const agent = Schema.decodeUnknownSync(
          Schema.Struct({ agent_id: Schema.String }),
        )(await agentResponse.json());
        const callResponse = await fetch("https://api.bolna.ai/call", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_id: agent.agent_id,
            recipient_phone_number: params.to,
          }),
        });
        if (!callResponse.ok) {
          throw new Error(`bolna call ${callResponse.status}`);
        }
        const call = Schema.decodeUnknownSync(
          Schema.Struct({ execution_id: Schema.optionalKey(Schema.String) }),
        )(await callResponse.json());
        return {
          carrier: "bolna" as const,
          carrierRef: call.execution_id ?? agent.agent_id,
        };
      },
      catch: (cause) => new CarrierError({ carrier: "bolna", reason: String(cause) }),
    }),
});

export interface TwilioConfig {
  readonly accountSid: string;
  readonly authToken: string;
  readonly fromNumber: string;
  readonly relayUrl: string;
}

export const twilioCarrier = (config: TwilioConfig): Carrier => ({
  name: "twilio",
  dial: (params) =>
    Effect.tryPromise({
      try: async () => {
        if (config.accountSid.length === 0 || config.relayUrl.length === 0) {
          throw new Error("twilio_relay_not_configured");
        }
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: params.to,
              From: config.fromNumber,
              Url: `${config.relayUrl}?maxSeconds=${params.maxSeconds}`,
            }).toString(),
          },
        );
        if (!response.ok) {
          throw new Error(`twilio call ${response.status}`);
        }
        const call = Schema.decodeUnknownSync(
          Schema.Struct({ sid: Schema.String }),
        )(await response.json());
        return { carrier: "twilio" as const, carrierRef: call.sid };
      },
      catch: (cause) => new CarrierError({ carrier: "twilio", reason: String(cause) }),
    }),
});
