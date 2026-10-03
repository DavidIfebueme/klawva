const BASE = import.meta.env.VITE_API_URL ?? "";

export interface AdminOverview {
  users: number;
  authors: number;
  sessions: number;
  pendingReviews: number;
  listingsByStatus: { status: string; count: number }[];
}

export interface ReviewItem {
  id: string;
  slug: string;
  name: string;
  priceMinor: number;
  ownerId: string;
  ownerEmail: string | null;
  score: number | null;
  soul: string | null;
}

export interface AuditItem {
  id: string;
  actorEmail: string;
  action: string;
  targetId: string;
  detail: string;
  createdAt: string;
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

export async function getAdminOverview(token: string): Promise<AdminOverview> {
  return request("/api/admin/overview", { headers: authHeaders(token) });
}

export async function getAdminReviews(token: string): Promise<ReviewItem[]> {
  return request("/api/admin/reviews", { headers: authHeaders(token) });
}

export async function getAdminAudit(token: string): Promise<AuditItem[]> {
  return request("/api/admin/audit", { headers: authHeaders(token) });
}

export async function approveListing(
  token: string,
  id: string,
): Promise<{ status: string }> {
  return request(`/api/admin/listings/${id}/approve`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function rejectListing(
  token: string,
  id: string,
  reason: string,
): Promise<{ status: string }> {
  return request(`/api/admin/listings/${id}/reject`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ reason }),
  });
}
