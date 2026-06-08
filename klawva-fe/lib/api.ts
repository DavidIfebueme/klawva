import {
  ActivateSessionResponse,
  BillingProfile,
  ContactEmailPayload,
  CreateSessionPayload,
  CreateSessionResponse,
  HistorySessionsResponse,
  InitializePaymentPayload,
  InitializePaymentResponse,
  RequestHistoryLinkResponse,
  SendEmailResponse,
  SessionStatusResponse,
  SessionQRResponse,
  SessionActivityResponse,
  SessionReportResponse,
} from '../types';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function inferCountryHintFromBrowser(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.toLowerCase() ?? '';
  if (timezone === 'africa/lagos') {
    return 'NG';
  }

  const languageTokens = [
    ...(navigator.languages ?? []),
    navigator.language,
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  if (languageTokens.some((value) => value.includes('-ng'))) {
    return 'NG';
  }

  return null;
}

function geoHintHeaders(): HeadersInit {
  if (typeof window === 'undefined') {
    return {};
  }

  const headers: Record<string, string> = {};
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone) {
    headers['x-klawva-timezone'] = timezone;
  }

  const languages = [
    ...(navigator.languages ?? []),
    navigator.language,
  ]
    .filter(Boolean)
    .join(',');
  if (languages) {
    headers['x-klawva-languages'] = languages;
  }

  const countryHint = inferCountryHintFromBrowser();
  if (countryHint) {
    headers['x-klawva-country-hint'] = countryHint;
  }

  return headers;
}

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
    headers: {
      'Content-Type': 'application/json',
      ...geoHintHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to initialize payment');
  return res.json();
}

export async function getBillingProfile(): Promise<BillingProfile> {
  const res = await fetch(`${BASE}/api/payments/billing-profile`, {
    headers: geoHintHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch billing profile');
  return res.json();
}

export async function sendContactEmail(payload: ContactEmailPayload): Promise<SendEmailResponse> {
  const res = await fetch(`${BASE}/api/emails/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to send contact email');
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
