import * as Schema from "effect/Schema";
import { ApiError } from "./api-error.ts";

const BASE = import.meta.env.VITE_API_URL ?? "";

const sessionSummary = Schema.Struct({
  id: Schema.String,
  state: Schema.String,
  channel: Schema.String,
  windowStart: Schema.NullOr(Schema.String),
  windowEnd: Schema.NullOr(Schema.String),
  budgetMinor: Schema.Number,
  spentMinor: Schema.Number,
  createdAt: Schema.String,
  listingName: Schema.NullOr(Schema.String),
  slug: Schema.NullOr(Schema.String),
});
export type AccountSessionSummary = typeof sessionSummary.Type;

const sessionDetailRow = Schema.Struct({
  id: Schema.String,
  state: Schema.String,
  channel: Schema.String,
  brief: Schema.String,
  windowStart: Schema.NullOr(Schema.String),
  windowEnd: Schema.NullOr(Schema.String),
  budgetMinor: Schema.Number,
  spentMinor: Schema.Number,
  createdAt: Schema.String,
  listingName: Schema.NullOr(Schema.String),
  slug: Schema.NullOr(Schema.String),
});
export type AccountSessionRow = typeof sessionDetailRow.Type;

const transcriptEntry = Schema.Struct({
  role: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
});
export type AccountTranscriptEntry = typeof transcriptEntry.Type;

const report = Schema.Struct({
  summary: Schema.String,
  shareToken: Schema.String,
  deliveredAt: Schema.NullOr(Schema.String),
});
export type AccountReport = typeof report.Type;

const sessionDetail = Schema.Struct({
  session: sessionDetailRow,
  transcript: Schema.Array(transcriptEntry),
  report: Schema.NullOr(report),
});
export type AccountSessionDetail = typeof sessionDetail.Type;

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

async function get(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-auth-token": token },
  });
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return res.json();
}

export async function listAccountSessions(
  token: string,
): Promise<ReadonlyArray<AccountSessionSummary>> {
  return Schema.decodeUnknownSync(Schema.Array(sessionSummary))(
    await get("/api/account/sessions", token),
  );
}

export async function getAccountSession(
  token: string,
  id: string,
): Promise<AccountSessionDetail> {
  return Schema.decodeUnknownSync(sessionDetail)(
    await get(`/api/account/sessions/${encodeURIComponent(id)}`, token),
  );
}
