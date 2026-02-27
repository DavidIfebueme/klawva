import {
  ActivityIngestPayload,
  ActivityIngestResponse,
  BootstrapResponse,
  CreateSessionPayload,
  CreateSessionResponse,
  InitializePaymentPayload,
  InitializePaymentResponse,
  ProvisioningResponse,
  SessionStatusResponse,
  SessionQRResponse,
  SessionActivityResponse,
  SessionReportResponse,
  TelegramAssignResponse,
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

export async function startProvisioning(sessionId: string): Promise<ProvisioningResponse> {
  const res = await fetch(`${BASE}/api/provisioning/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to start provisioning');
  return res.json();
}

export async function bootstrapProvisioning(sessionId: string): Promise<BootstrapResponse> {
  const res = await fetch(`${BASE}/api/provisioning/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to bootstrap provisioning');
  return res.json();
}

export async function assignTelegramToken(sessionId: string): Promise<TelegramAssignResponse> {
  const res = await fetch(`${BASE}/api/channels/telegram/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to assign telegram token');
  return res.json();
}

export async function ingestActivity(payload: ActivityIngestPayload): Promise<ActivityIngestResponse> {
  const res = await fetch(`${BASE}/api/activity/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to ingest activity');
  return res.json();
}

export async function getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/status`);
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

export async function getSessionQR(sessionId: string): Promise<SessionQRResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/qr`);
  if (!res.ok) throw new Error('Failed to fetch QR');
  return res.json();
}

export async function getSessionActivity(sessionId: string): Promise<SessionActivityResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/activity`);
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

export async function getSessionReport(sessionId: string): Promise<SessionReportResponse> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/report`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}
