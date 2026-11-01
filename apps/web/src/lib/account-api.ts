import * as Schema from "effect/Schema";
import { ApiError, failureMessage } from "./api-error.ts";

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
  sessionToken: Schema.optionalKey(Schema.NullOr(Schema.String)),
  listingName: Schema.NullOr(Schema.String),
  slug: Schema.NullOr(Schema.String),
});
export type AccountSessionRow = typeof sessionDetailRow.Type;

const stateLabels: Readonly<Record<string, string>> = {
  pending: "Pending",
  active: "Active",
  hibernating: "Paused",
  recovering: "Paused",
  completed: "Finished",
  failed: "Failed",
  expired: "Expired",
};

export const sessionStateLabel = (state: string): string =>
  stateLabels[state] ?? state;

const channelLabels: Readonly<Record<string, string>> = {
  web: "Web chat",
  telegram: "Telegram",
  email: "Email",
};

export const sessionChannelLabel = (channel: string): string =>
  channelLabels[channel] ?? channel;

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

const member = Schema.Struct({ email: Schema.String, role: Schema.String });
export type AccountMember = typeof member.Type;

async function post(
  path: string,
  token: string,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "x-auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return res.json();
}

export async function listMembers(
  token: string,
  id: string,
): Promise<ReadonlyArray<AccountMember>> {
  return Schema.decodeUnknownSync(Schema.Array(member))(
    await get(`/api/account/sessions/${encodeURIComponent(id)}/members`, token),
  );
}

export async function addMember(
  token: string,
  id: string,
  email: string,
): Promise<{ ok: boolean }> {
  return Schema.decodeUnknownSync(Schema.Struct({ ok: Schema.Boolean }))(
    await post(`/api/account/sessions/${encodeURIComponent(id)}/members`, token, {
      email,
    }),
  );
}

export async function submitFeedback(
  token: string,
  id: string,
  rating: number,
  report?: string,
): Promise<{ ok: boolean }> {
  return Schema.decodeUnknownSync(Schema.Struct({ ok: Schema.Boolean }))(
    await post(`/api/sessions/${encodeURIComponent(id)}/feedback`, token, {
      rating,
      report,
    }),
  );
}

const deletionRequest = Schema.Struct({ deadline: Schema.String });

export async function requestSessionDeletion(
  token: string,
  id: string,
): Promise<{ deadline: string }> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(id)}/delete-my-data`,
    { method: "POST", headers: { "x-auth-token": token } },
  );
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return Schema.decodeUnknownSync(deletionRequest)(await res.json());
}

export const LinkChannel = Schema.Literals([
  "telegram",
  "web",
  "email",
  "slack",
  "discord",
]);
export type LinkChannel = typeof LinkChannel.Type;

const channelLink = Schema.Struct({
  channel: LinkChannel,
  chatId: Schema.String,
  createdAt: Schema.String,
});
export type AccountChannelLink = typeof channelLink.Type;

export async function listChannels(
  token: string,
  id: string,
): Promise<ReadonlyArray<AccountChannelLink>> {
  return Schema.decodeUnknownSync(Schema.Array(channelLink))(
    await get(`/api/account/sessions/${encodeURIComponent(id)}/channels`, token),
  );
}

export async function unlinkChannel(
  token: string,
  id: string,
  channel: LinkChannel,
  chatId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `${BASE}/api/account/sessions/${encodeURIComponent(id)}/channels/${encodeURIComponent(channel)}/${encodeURIComponent(chatId)}`,
    { method: "DELETE", headers: { "x-auth-token": token } },
  );
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return Schema.decodeUnknownSync(Schema.Struct({ ok: Schema.Boolean }))(
    await res.json(),
  );
}
