import * as Schema from "effect/Schema";
import { ApiError, failureMessage } from "./api-error.ts";

const BASE = import.meta.env.VITE_API_URL ?? "";

const stat = Schema.Struct({ label: Schema.String, value: Schema.String });

const sharedReport = Schema.Struct({
  summary: Schema.String,
  shareToken: Schema.String,
  stats: Schema.Union([Schema.Array(stat), Schema.String]),
  agentSlug: Schema.String,
  agentName: Schema.String,
});
export type SharedReport = typeof sharedReport.Type;

export async function getSharedReport(
  sessionId: string,
  shareToken: string,
): Promise<SharedReport> {
  const res = await fetch(
    `${BASE}/api/reports/shared/${encodeURIComponent(sessionId)}?shareToken=${encodeURIComponent(shareToken)}`,
  );
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return Schema.decodeUnknownSync(sharedReport)(await res.json());
}

export interface ContactInput {
  name: string;
  email: string;
  employeeType?: string;
  description: string;
}

export async function sendContact(input: ContactInput): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/emails/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return Schema.decodeUnknownSync(Schema.Struct({ ok: Schema.Boolean }))(
    await res.json(),
  );
}
