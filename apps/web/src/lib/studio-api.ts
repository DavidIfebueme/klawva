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

export const laneSchema = Schema.Literals(["authored", "hosted", "desktop"]);
export type Lane = typeof laneSchema.Type;

const hostedConfig = Schema.Struct({
  cardUrl: Schema.String,
  mode: Schema.Literals(["push", "pull"]),
  authType: Schema.optionalKey(Schema.String),
  authHeader: Schema.optionalKey(Schema.String),
});
export type HostedConfig = typeof hostedConfig.Type;

const desktopCapabilities = Schema.Struct({
  screen: Schema.optionalKey(Schema.String),
  input: Schema.optionalKey(Schema.Array(Schema.String)),
  network: Schema.optionalKey(Schema.Array(Schema.String)),
  fs: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type DesktopCapabilities = typeof desktopCapabilities.Type;

const desktopConfig = Schema.Struct({
  bundleId: Schema.String,
  entrypoint: Schema.String,
  dataDirs: Schema.Array(Schema.String),
  capabilities: desktopCapabilities,
});
export type DesktopConfig = typeof desktopConfig.Type;

const dataPolicy = Schema.Struct({
  retentionDays: Schema.Number,
  leavesCountry: Schema.Boolean,
  dpia: Schema.Boolean,
});
export type DataPolicy = typeof dataPolicy.Type;

const limitsConfig = Schema.Struct({
  maxWallClockSeconds: Schema.optionalKey(Schema.Number),
  maxEvents: Schema.optionalKey(Schema.Number),
  maxEventBytes: Schema.optionalKey(Schema.Number),
  maxArtifactBytes: Schema.optionalKey(Schema.Number),
  minIdleSeconds: Schema.optionalKey(Schema.Number),
});
export type LimitsConfig = typeof limitsConfig.Type;

const hostedManifest = Schema.Struct({
  cardUrl: Schema.String,
  mode: Schema.String,
});

const desktopManifest = Schema.Struct({
  bundleId: Schema.String,
  entrypoint: Schema.String,
  dataDirs: Schema.Array(Schema.String),
  capabilities: desktopCapabilities,
});

const manifest = Schema.Struct({
  kind: Schema.optionalKey(Schema.String),
  billing: Schema.optionalKey(Schema.String),
  transport: Schema.optionalKey(Schema.Array(Schema.String)),
  hosted: Schema.optionalKey(Schema.NullOr(hostedManifest)),
  desktop: Schema.optionalKey(Schema.NullOr(desktopManifest)),
  limits: Schema.optionalKey(Schema.NullOr(limitsConfig)),
  data: Schema.optionalKey(Schema.NullOr(dataPolicy)),
  launchMarkets: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type StudioManifest = typeof manifest.Type;

const kitStep = Schema.Struct({
  step: Schema.String,
  ok: Schema.Boolean,
  detail: Schema.String,
});
export type KitStep = typeof kitStep.Type;

const kitRun = Schema.Struct({
  ok: Schema.Boolean,
  steps: Schema.Array(kitStep),
});
export type KitRun = typeof kitRun.Type;

const kitState = Schema.Struct({
  ranAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ok: Schema.Boolean,
  steps: Schema.Array(kitStep),
});
export type KitState = typeof kitState.Type;

const bundleInfo = Schema.Struct({
  version: Schema.NullOr(Schema.String),
  sha256: Schema.NullOr(Schema.String),
});
export type BundleInfo = typeof bundleInfo.Type;

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
  lane: Schema.optionalKey(laneSchema),
  manifest: Schema.optionalKey(Schema.NullOr(manifest)),
  kit: Schema.optionalKey(Schema.NullOr(kitState)),
  bundle: Schema.optionalKey(bundleInfo),
  canSubmit: Schema.optionalKey(Schema.Boolean),
  submitBlockedReason: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
export type StudioListingDetail = typeof listingDetail.Type;

const identity = Schema.Struct({
  email: Schema.String,
  displayName: Schema.optionalKey(Schema.String),
});
export type StudioIdentity = typeof identity.Type;

const evalOutcome = Schema.Struct({ score: Schema.Number, band: Schema.String });
export type EvalOutcome = typeof evalOutcome.Type;

const submitOutcome = Schema.Struct({
  score: Schema.Number,
  band: Schema.String,
  status: Schema.String,
});
export type SubmitOutcome = typeof submitOutcome.Type;

const authVerify = Schema.Struct({
  sessionToken: Schema.String,
  email: Schema.String,
  admin: Schema.Boolean,
});

const okResponse = Schema.Struct({ ok: Schema.Boolean });
const idResponse = Schema.Struct({ id: Schema.String });

interface LaneFields {
  lane?: Lane;
  launchMarkets?: ReadonlyArray<string>;
  hosted?: HostedConfig;
  desktop?: DesktopConfig;
  data?: DataPolicy;
  limits?: LimitsConfig;
}

export interface DraftInput extends LaneFields {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  priceMinor: number;
  budgetMinor: number;
  briefFields: string[];
  soul: string;
}

export interface UpdateInput extends LaneFields {
  name: string;
  tagline: string;
  category: string;
  priceMinor: number;
  budgetMinor: number;
  briefFields: string[];
  soul: string;
}

export interface BundleUploadInput {
  bundleId: string;
  version: string;
  bytesBase64: string;
  signature: string;
  minSupported?: string;
  capabilities: Record<string, string>;
}

export interface PayoutInput {
  psp: "paystack" | "flutterwave";
  subaccount: string;
  country: string;
  currency: string;
  tin: string;
  acceptTerms: boolean;
}

const limitsStatus = Schema.Struct({
  tier: Schema.Number,
  cap: Schema.Number,
  used: Schema.Number,
});
export type AuthorLimits = typeof limitsStatus.Type;

const payoutAccount = Schema.Struct({
  tier: Schema.Number,
  country: Schema.NullOr(Schema.String),
  tin: Schema.NullOr(Schema.String),
  psp: Schema.NullOr(Schema.String),
  subaccount: Schema.NullOr(Schema.String),
  currency: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.String),
});
export type AuthorPayout = typeof payoutAccount.Type;

const earningsMoney = Schema.Struct({
  grossMinor: Schema.Number,
  commissionMinor: Schema.Number,
  netMinor: Schema.Number,
});

const earningInstruction = Schema.Struct({
  period: Schema.String,
  grossMinor: Schema.Number,
  commissionMinor: Schema.Number,
  whtMinor: Schema.Number,
  netMinor: Schema.Number,
  status: Schema.String,
  psp: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
export type EarningInstruction = typeof earningInstruction.Type;

const authorEarnings = Schema.Struct({
  tier: Schema.Number,
  currency: Schema.String,
  pending: earningsMoney,
  instructions: Schema.Array(earningInstruction),
});
export type AuthorEarnings = typeof authorEarnings.Type;

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

export async function requestStudioLink(
  email: string,
  next: string,
): Promise<{ ok: boolean }> {
  return Schema.decodeUnknownSync(okResponse)(
    await send("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next }),
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

export async function saveAuthorName(
  token: string,
  displayName: string,
): Promise<{ displayName: string }> {
  return Schema.decodeUnknownSync(Schema.Struct({ displayName: Schema.String }))(
    await send("/api/author/profile", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ displayName }),
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

export async function deleteStudioListing(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  return Schema.decodeUnknownSync(Schema.Struct({ ok: Schema.Boolean }))(
    await send(`/api/author/listings/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
  );
}

export async function withdrawStudioListing(
  token: string,
  id: string,
): Promise<{ status: string }> {
  return Schema.decodeUnknownSync(Schema.Struct({ status: Schema.String }))(
    await send(`/api/author/listings/${id}/withdraw`, {
      method: "POST",
      headers: authHeaders(token),
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

export async function runStudioKit(
  token: string,
  id: string,
): Promise<KitRun> {
  return Schema.decodeUnknownSync(kitRun)(
    await send(`/api/author/listings/${id}/kit`, {
      method: "POST",
      headers: authHeaders(token),
    }),
  );
}

export async function uploadAuthorBundle(
  token: string,
  input: BundleUploadInput,
): Promise<BundleInfo> {
  return Schema.decodeUnknownSync(bundleInfo)(
    await send("/api/author/bundles", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    }),
  );
}

export async function getAuthorLimits(token: string): Promise<AuthorLimits> {
  return Schema.decodeUnknownSync(limitsStatus)(
    await send("/api/author/limits", { headers: authHeaders(token) }),
  );
}

export async function getAuthorPayout(token: string): Promise<AuthorPayout> {
  return Schema.decodeUnknownSync(payoutAccount)(
    await send("/api/author/payout", { headers: authHeaders(token) }),
  );
}

export async function saveAuthorPayout(
  token: string,
  input: PayoutInput,
): Promise<{ ok: boolean }> {
  return Schema.decodeUnknownSync(okResponse)(
    await send("/api/author/payout", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    }),
  );
}

export async function getAuthorEarnings(
  token: string,
): Promise<AuthorEarnings> {
  return Schema.decodeUnknownSync(authorEarnings)(
    await send("/api/author/earnings", { headers: authHeaders(token) }),
  );
}
