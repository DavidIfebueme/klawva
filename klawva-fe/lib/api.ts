import {
  CreateSessionPayload,
  CreateSessionResponse,
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
