const BASE = import.meta.env.VITE_API_URL ?? "";

export interface StudioListingSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  priceMinor: number;
  version: number;
}

export interface StudioListingDetail extends StudioListingSummary {
  tagline: string;
  category: string;
  soul: string;
  briefFields: string;
}

export interface StudioIdentity {
  email: string;
  feePaid: boolean;
}

export interface EvalOutcome {
  score: number;
  band: string;
}

export interface SubmitOutcome extends EvalOutcome {
  status: string;
}

export interface FeeCheckout {
  reference: string;
  checkoutUrl: string;
}

export interface DraftInput {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  priceMinor: number;
  briefFields: string[];
  soul: string;
}

export interface UpdateInput {
  name: string;
  tagline: string;
  category: string;
  priceMinor: number;
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

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(await failureMessage(res));
  }
  return await res.json();
}

function authHeaders(token: string): HeadersInit {
  return { "x-auth-token": token, "Content-Type": "application/json" };
}

export async function requestStudioLink(email: string): Promise<{ ok: boolean }> {
  return request("/api/auth/request-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function verifyStudioLink(
  token: string,
): Promise<{ sessionToken: string; email: string; admin: boolean }> {
  return request("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export async function getStudioMe(token: string): Promise<StudioIdentity> {
  return request("/api/author/me", { headers: authHeaders(token) });
}

export async function getStudioListings(token: string): Promise<StudioListingSummary[]> {
  return request("/api/author/listings", { headers: authHeaders(token) });
}

export async function getStudioListing(
  token: string,
  id: string,
): Promise<StudioListingDetail> {
  return request(`/api/author/listings/${id}`, { headers: authHeaders(token) });
}

export async function updateStudioListing(
  token: string,
  id: string,
  input: UpdateInput,
): Promise<{ ok: boolean }> {
  return request(`/api/author/listings/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function createStudioListing(
  token: string,
  input: DraftInput,
): Promise<{ id: string }> {
  return request("/api/author/listings", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function runStudioSandbox(token: string, id: string): Promise<EvalOutcome> {
  return request(`/api/author/listings/${id}/sandbox`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function submitStudioListing(
  token: string,
  id: string,
): Promise<SubmitOutcome> {
  return request(`/api/author/listings/${id}/submit`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function startAuthorFee(token: string): Promise<FeeCheckout> {
  return request("/api/author/fee", {
    method: "POST",
    headers: authHeaders(token),
  });
}
