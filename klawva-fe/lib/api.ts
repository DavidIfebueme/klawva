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
  WhatsAppLockAccessResponse,
  UserProfileResponse,
  DashboardSessionEntry,
  WalletDetailsResponse,
  WalletTransactionEntry,
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
  if (!res.ok) {
    let message = 'Failed to activate session';
    try {
      const payload = await res.json();
      message = payload?.error?.message || payload?.detail || message;
    } catch {
    }
    throw new Error(message);
  }
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

export async function getSharedSessionReport(sessionId: string, shareToken: string): Promise<SessionReportResponse> {
  const res = await fetch(`${BASE}/api/reports/shared/${sessionId}?shareToken=${encodeURIComponent(shareToken)}`);
  if (!res.ok) throw new Error('Failed to fetch shared report');
  return res.json();
}

export async function lockTelegramAccess(
  sessionId: string,
  sessionToken: string,
): Promise<{ locked: boolean; telegramUserId?: string }> {
  const res = await fetch(`${BASE}/api/channels/telegram/lock-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...sessionTokenHeaders(sessionToken),
    },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) return { locked: false };
  const data = await res.json();
  return {
    locked: data.locked ?? false,
    telegramUserId: data.telegramUserId,
  };
}

export async function lockWhatsAppAccess(
  sessionId: string,
  sessionToken: string,
): Promise<WhatsAppLockAccessResponse> {
  const res = await fetch(`${BASE}/api/channels/whatsapp/lock-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...sessionTokenHeaders(sessionToken),
    },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) return { locked: false };
  const data = await res.json();
  return {
    locked: data.locked ?? false,
    whatsappPhoneNumber: data.whatsappPhoneNumber,
    overlapWarning: data.overlapWarning,
  };
}

function dashboardTokenHeaders(token?: string): HeadersInit {
  return token ? { 'x-dashboard-token': token } : {};
}

export async function requestDashboardMagicLink(email: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/api/dashboard/auth/request-magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('Failed to request login link');
  return res.json();
}

export async function verifyDashboardMagicLink(token: string): Promise<{ token: string; user: UserProfileResponse }> {
  const res = await fetch(`${BASE}/api/dashboard/auth/verify-magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    let message = 'Failed to verify login link';
    try {
      const payload = await res.json();
      message = payload?.detail || message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export async function getDashboardMe(token: string): Promise<UserProfileResponse> {
  const res = await fetch(`${BASE}/api/dashboard/me`, {
    headers: dashboardTokenHeaders(token),
  });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function getDashboardSessions(token: string): Promise<DashboardSessionEntry[]> {
  const res = await fetch(`${BASE}/api/dashboard/sessions`, {
    headers: dashboardTokenHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch dashboard sessions');
  return res.json();
}

export async function getDashboardSession(id: string, token: string): Promise<DashboardSessionEntry> {
  const res = await fetch(`${BASE}/api/dashboard/sessions/${id}`, {
    headers: dashboardTokenHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch session detail');
  return res.json();
}

export async function toggleDashboardSessionAutoRenew(
  id: string,
  autoRenew: boolean,
  token: string,
): Promise<DashboardSessionEntry> {
  const res = await fetch(`${BASE}/api/dashboard/sessions/${id}/auto-renew`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...dashboardTokenHeaders(token),
    },
    body: JSON.stringify({ auto_renew: autoRenew }),
  });
  if (!res.ok) throw new Error('Failed to toggle auto-renewal');
  return res.json();
}

export async function getDashboardSessionBrief(id: string, token: string): Promise<{ brief: Record<string, any> }> {
  const res = await fetch(`${BASE}/api/dashboard/sessions/${id}/brief`, {
    headers: dashboardTokenHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch brief');
  return res.json();
}

export async function updateDashboardSessionBrief(
  id: string,
  brief: Record<string, any>,
  token: string,
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/api/dashboard/sessions/${id}/brief`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...dashboardTokenHeaders(token),
    },
    body: JSON.stringify({ brief }),
  });
  if (!res.ok) throw new Error('Failed to update brief');
  return res.json();
}

export async function getDashboardWallet(token: string): Promise<WalletDetailsResponse> {
  const res = await fetch(`${BASE}/api/dashboard/wallet`, {
    headers: dashboardTokenHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch wallet details');
  return res.json();
}

export async function createDashboardVirtualAccount(token: string): Promise<WalletDetailsResponse> {
  const res = await fetch(`${BASE}/api/dashboard/wallet/create-virtual-account`, {
    method: 'POST',
    headers: dashboardTokenHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to create virtual account');
  return res.json();
}

export async function getDashboardWalletTransactions(token: string): Promise<WalletTransactionEntry[]> {
  const res = await fetch(`${BASE}/api/dashboard/wallet/transactions`, {
    headers: dashboardTokenHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch transaction history');
  return res.json();
}
