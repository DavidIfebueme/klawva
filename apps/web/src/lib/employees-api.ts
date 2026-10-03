import * as Schema from "effect/Schema";
import { ApiError } from "./api-error.ts";

const BASE = import.meta.env.VITE_API_URL ?? "";

const employeeSummary = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  priceMinor: Schema.Number,
  budgetMinor: Schema.Number,
  version: Schema.Number,
  ownerId: Schema.String,
  score: Schema.NullOr(Schema.Number),
});
export type EmployeeSummary = typeof employeeSummary.Type;

const employeeDetail = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  priceMinor: Schema.Number,
  budgetMinor: Schema.Number,
  version: Schema.Number,
  briefFields: Schema.String,
});
export type EmployeeDetail = typeof employeeDetail.Type;

const config = Schema.Struct({ telegramBotUsername: Schema.String });

const sessionCreated = Schema.Struct({ id: Schema.String });
const checkout = Schema.Struct({
  reference: Schema.String,
  checkoutUrl: Schema.String,
});

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

async function send(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return res.json();
}

export async function listEmployees(): Promise<ReadonlyArray<EmployeeSummary>> {
  return Schema.decodeUnknownSync(Schema.Array(employeeSummary))(
    await send("/api/listings"),
  );
}

export async function getEmployee(slug: string): Promise<EmployeeDetail> {
  return Schema.decodeUnknownSync(employeeDetail)(
    await send(`/api/listings/${encodeURIComponent(slug)}`),
  );
}

export async function getConfig(): Promise<{ telegramBotUsername: string }> {
  return Schema.decodeUnknownSync(config)(await send("/api/config"));
}

const sessionLaunch = Schema.Struct({
  telegramBotUsername: Schema.String,
  code: Schema.String,
});

export async function getSessionLaunch(
  sessionId: string,
): Promise<{ telegramBotUsername: string; code: string }> {
  return Schema.decodeUnknownSync(sessionLaunch)(
    await send(`/api/sessions/${encodeURIComponent(sessionId)}/launch`),
  );
}

const chatMessage = Schema.Struct({
  role: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
});
export type ChatMessage = typeof chatMessage.Type;

export async function getChatMessages(
  sessionId: string,
): Promise<ReadonlyArray<ChatMessage>> {
  return Schema.decodeUnknownSync(Schema.Array(chatMessage))(
    await send(`/api/sessions/${encodeURIComponent(sessionId)}/messages`),
  );
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
): Promise<{ reply: string }> {
  return Schema.decodeUnknownSync(Schema.Struct({ reply: Schema.String }))(
    await send(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }),
  );
}

export interface HireSessionInput {
  listingId: string;
  agentId: string;
  channel: "telegram" | "whatsapp";
  brief: Record<string, string>;
  customerEmail: string;
}

export async function createHireSession(
  input: HireSessionInput,
): Promise<{ id: string }> {
  return Schema.decodeUnknownSync(sessionCreated)(
    await send("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function initializeHirePayment(
  sessionId: string,
  email: string,
): Promise<{ reference: string; checkoutUrl: string }> {
  return Schema.decodeUnknownSync(checkout)(
    await send("/api/payments/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, amountMinor: 0, email }),
    }),
  );
}
