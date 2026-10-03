import * as Schema from "effect/Schema";

const BASE = import.meta.env.VITE_API_URL ?? "";

const overview = Schema.Struct({
  users: Schema.Number,
  authors: Schema.Number,
  sessions: Schema.Number,
  pendingReviews: Schema.Number,
  listingsByStatus: Schema.Array(
    Schema.Struct({ status: Schema.String, count: Schema.Number }),
  ),
});
export type AdminOverview = typeof overview.Type;

const reviewItem = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  priceMinor: Schema.Number,
  ownerId: Schema.String,
  ownerEmail: Schema.NullOr(Schema.String),
  score: Schema.NullOr(Schema.Number),
  soul: Schema.NullOr(Schema.String),
});
export type ReviewItem = typeof reviewItem.Type;

const auditItem = Schema.Struct({
  id: Schema.String,
  actorEmail: Schema.String,
  action: Schema.String,
  targetId: Schema.String,
  detail: Schema.String,
  createdAt: Schema.String,
});
export type AuditItem = typeof auditItem.Type;

const statusResponse = Schema.Struct({ status: Schema.String });

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
    throw new Error(await failureMessage(res));
  }
  return res.json();
}

function authHeaders(token: string): HeadersInit {
  return { "x-auth-token": token, "Content-Type": "application/json" };
}

export async function getAdminOverview(token: string): Promise<AdminOverview> {
  return Schema.decodeUnknownSync(overview)(
    await send("/api/admin/overview", { headers: authHeaders(token) }),
  );
}

export async function getAdminReviews(token: string): Promise<ReadonlyArray<ReviewItem>> {
  return Schema.decodeUnknownSync(Schema.Array(reviewItem))(
    await send("/api/admin/reviews", { headers: authHeaders(token) }),
  );
}

export async function getAdminAudit(token: string): Promise<ReadonlyArray<AuditItem>> {
  return Schema.decodeUnknownSync(Schema.Array(auditItem))(
    await send("/api/admin/audit", { headers: authHeaders(token) }),
  );
}

export async function approveListing(
  token: string,
  id: string,
): Promise<{ status: string }> {
  return Schema.decodeUnknownSync(statusResponse)(
    await send(`/api/admin/listings/${id}/approve`, {
      method: "POST",
      headers: authHeaders(token),
    }),
  );
}

export async function rejectListing(
  token: string,
  id: string,
  reason: string,
): Promise<{ status: string }> {
  return Schema.decodeUnknownSync(statusResponse)(
    await send(`/api/admin/listings/${id}/reject`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    }),
  );
}
