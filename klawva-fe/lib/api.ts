import {
  ActivateSessionResponse,
  BillingProfile,
  CreateSessionPayload,
  CreateSessionResponse,
  HistorySessionsResponse,
  InitializePaymentPayload,
  InitializePaymentResponse,
  RequestHistoryLinkResponse,
  SessionStatusResponse,
  SessionQRResponse,
  SessionActivityResponse,
  SessionReportResponse,
} from '../types';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function createSession(payload: CreateSessionPayload): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function initializePayment(
  payload: InitializePaymentPayload,
): Promise<InitializePaymentResponse> {
  const res = await fetch(`${BASE}/api/payments/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to initialize payment');
  return res.json();
}

export async function getBillingProfile(): Promise<BillingProfile> {
  const res = await fetch(`${BASE}/api/payments/billing-profile`);
  if (!res.ok) throw new Error('Failed to fetch billing profile');
  return res.json();
}

function sessionTokenHeaders(sessionToken?: string): HeadersInit {
  return sessionToken ? { 'x-session-token': sessionToken } : {};
}

export async function activateSession(
  sessionId: string,
  sessionToken: string,
): Promise<ActivateSessionResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...sessionTokenHeaders(sessionToken),
    },
  });
  if (!res.ok) throw new Error('Failed to activate session');
  return res.json();
}

export async function requestHistoryLink(email: string): Promise<RequestHistoryLinkResponse> {
  const res = await fetch(`${BASE}/api/history/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('Failed to request history link');
  return res.json();
}

export async function getHistorySessions(token: string): Promise<HistorySessionsResponse> {
  const res = await fetch(`${BASE}/api/history/sessions?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error('Failed to fetch history sessions');
  return res.json();
}

export async function getSessionStatus(sessionId: string, sessionToken: string): Promise<SessionStatusResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/status`, {
    headers: sessionTokenHeaders(sessionToken),
  });
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

export async function getSessionQR(sessionId: string, sessionToken: string): Promise<SessionQRResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/qr`, {
    headers: sessionTokenHeaders(sessionToken),
  });
  if (!res.ok) throw new Error('Failed to fetch QR');
  return res.json();
}

export async function getSessionActivity(sessionId: string, sessionToken: string): Promise<SessionActivityResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/activity`, {
    headers: sessionTokenHeaders(sessionToken),
  });
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

export async function getSessionReport(sessionId: string, sessionToken: string): Promise<SessionReportResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/report`, {
    headers: sessionTokenHeaders(sessionToken),
  });
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}
