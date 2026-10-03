import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type {
  AgentRuntimeImpl,
  ChatMessage,
  ModelError,
} from "../agent/runtime.ts";

const ReportStats = Schema.Array(
  Schema.Struct({ label: Schema.String, value: Schema.String }),
);
const ReportJson = Schema.Struct({
  summary: Schema.String,
  stats: ReportStats,
});

export interface Report {
  readonly summary: string;
  readonly stats: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
  }>;
}

export const fallbackReport = (
  history: ReadonlyArray<ChatMessage>,
): Report => {
  const last = [...history].reverse().find((message) => message.role === "assistant");
  return {
    summary: last?.content.slice(0, 500) ?? "Shift complete.",
    stats: [],
  };
};

const extractJson = (text: string): string => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
};

export const parseReport = (
  text: string,
  history: ReadonlyArray<ChatMessage>,
): Report => {
  const json = extractJson(text);
  if (json.length === 0) {
    return fallbackReport(history);
  }
  const decoded = Schema.decodeUnknownOption(
    Schema.fromJsonString(ReportJson),
  )(json);
  return decoded._tag === "Some" ? decoded.value : fallbackReport(history);
};

export const generateReport = (params: {
  readonly runtime: AgentRuntimeImpl;
  readonly history: ReadonlyArray<ChatMessage>;
}): Effect.Effect<Report, ModelError> =>
  Effect.gen(function* () {
    const transcript = params.history
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")
      .slice(0, 8000);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          'Write an end-of-shift report. Reply with JSON only: {"summary": "...", "stats": [{"label": "...", "value": "..."}]}.',
      },
      {
        role: "user",
        content: transcript.length > 0 ? transcript : "(no messages)",
      },
    ];
    const result = yield* params.runtime.complete(messages, false);
    return parseReport(result.text, params.history);
  });
