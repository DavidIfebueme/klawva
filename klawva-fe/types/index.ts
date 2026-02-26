import { AgentId } from '@/lib/agents';

export interface SessionStatusResponse {
  status: 'provisioning' | 'ready' | 'active' | 'completed';
  connected?: boolean;
}

export interface SessionQRResponse {
  qr: string;
  expiresIn: number;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  text: string;
}

export interface SessionActivityResponse {
  activities: ActivityEntry[];
}

export interface SessionReportResponse {
  dateRange: string;
  stats: { label: string; value: string }[];
  summary: string;
}

export interface CreateSessionPayload {
  agentId: AgentId;
  channel: 'whatsapp' | 'telegram';
  brief: Record<string, string>;
  paymentRef: string;
}

export interface CreateSessionResponse {
  sessionId: string;
}
