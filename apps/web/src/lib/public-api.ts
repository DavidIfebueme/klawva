import * as Schema from "effect/Schema";
import { ApiError } from "./api-error.ts";

const BASE = import.meta.env.VITE_API_URL ?? "";

const stat = Schema.Struct({ label: Schema.String, value: Schema.String });

const sharedReport = Schema.Struct({
  summary: Schema.String,
  shareToken: Schema.String,
  stats: Schema.Union([Schema.Array(stat), Schema.String]),
});
export type SharedReport = typeof sharedReport.Type;

async function failureMessage(res: Response): Promise<string> {
  try {
    const payload: unknown = await res.json();
    if (payload !== null && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (typeof record.reason === "string") return record.reason;
      if (typeof record._tag === "string") return record._tag;
      if (typeof record.detail === "string") return record.detail;
    }
  } catch {
    return `Request failed (${res.status})`;
  }
  return `Request failed (${res.status})`;
}

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
