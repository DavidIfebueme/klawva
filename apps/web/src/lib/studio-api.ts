import * as Schema from "effect/Schema";
import { ApiError } from "./api-error.ts";

const BASE = import.meta.env.VITE_API_URL ?? "";

const listingSummary = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  status: Schema.String,
  priceMinor: Schema.Number,
  version: Schema.Number,
});
export type StudioListingSummary = typeof listingSummary.Type;

const listingDetail = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  status: Schema.String,
  priceMinor: Schema.Number,
  budgetMinor: Schema.Number,
  version: Schema.Number,
  tagline: Schema.String,
  category: Schema.String,
  soul: Schema.String,
  briefFields: Schema.String,
});
export type StudioListingDetail = typeof listingDetail.Type;

const identity = Schema.Struct({ email: Schema.String, feePaid: Schema.Boolean });
export type StudioIdentity = typeof identity.Type;

const evalOutcome = Schema.Struct({ score: Schema.Number, band: Schema.String });
export type EvalOutcome = typeof evalOutcome.Type;

const submitOutcome = Schema.Struct({
  score: Schema.Number,
  band: Schema.String,
  status: Schema.String,
});
export type SubmitOutcome = typeof submitOutcome.Type;

const checkout = Schema.Struct({
  reference: Schema.String,
  checkoutUrl: Schema.String,
});
export type FeeCheckout = typeof checkout.Type;

const authVerify = Schema.Struct({
  sessionToken: Schema.String,
  email: Schema.String,
  admin: Schema.Boolean,
});

const okResponse = Schema.Struct({ ok: Schema.Boolean });
const idResponse = Schema.Struct({ id: Schema.String });

export interface DraftInput {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  priceMinor: number;
  budgetMinor: number;
  briefFields: string[];
  soul: string;
}

export interface UpdateInput {
  name: string;
  tagline: string;
  category: string;
  priceMinor: number;
  budgetMinor: number;
  briefFields: string[];
  soul: string;
}

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

async function send(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    throw new ApiError(await failureMessage(res), res.status);
  }
  return res.json();
}

function authHeaders(token: string): HeadersInit {
  return { "x-auth-token": token, "Content-Type": "application/json" };
}

export async function requestStudioLink(email: string): Promise<{ ok: boolean }> {
  return Schema.decodeUnknownSync(okResponse)(
    await send("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  );
}

export async function verifyStudioLink(
  token: string,
): Promise<{ sessionToken: string; email: string; admin: boolean }> {
  return Schema.decodeUnknownSync(authVerify)(
    await send("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }),
  );
}

export async function getStudioMe(token: string): Promise<StudioIdentity> {
  return Schema.decodeUnknownSync(identity)(
    await send("/api/author/me", { headers: authHeaders(token) }),
  );
}

export async function getStudioListings(
  token: string,
): Promise<ReadonlyArray<StudioListingSummary>> {
  return Schema.decodeUnknownSync(Schema.Array(listingSummary))(
    await send("/api/author/listings", { headers: authHeaders(token) }),
  );
}

export async function getStudioListing(
  token: string,
  id: string,
): Promise<StudioListingDetail> {
  return Schema.decodeUnknownSync(listingDetail)(
    await send(`/api/author/listings/${id}`, { headers: authHeaders(token) }),
  );
}

export async function updateStudioListing(
  token: string,
  id: string,
  input: UpdateInput,
): Promise<{ ok: boolean }> {
  return Schema.decodeUnknownSync(okResponse)(
    await send(`/api/author/listings/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    }),
  );
}

export async function createStudioListing(
  token: string,
  input: DraftInput,
): Promise<{ id: string }> {
  return Schema.decodeUnknownSync(idResponse)(
    await send("/api/author/listings", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    }),
  );
}

export async function runStudioSandbox(
  token: string,
  id: string,
): Promise<EvalOutcome> {
  return Schema.decodeUnknownSync(evalOutcome)(
    await send(`/api/author/listings/${id}/sandbox`, {
      method: "POST",
      headers: authHeaders(token),
    }),
  );
}

export async function submitStudioListing(
  token: string,
  id: string,
): Promise<SubmitOutcome> {
  return Schema.decodeUnknownSync(submitOutcome)(
    await send(`/api/author/listings/${id}/submit`, {
      method: "POST",
      headers: authHeaders(token),
    }),
  );
}

export async function startAuthorFee(token: string): Promise<FeeCheckout> {
  return Schema.decodeUnknownSync(checkout)(
    await send("/api/author/fee", { method: "POST", headers: authHeaders(token) }),
  );
}
