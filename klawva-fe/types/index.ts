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

export type PaymentProvider = 'paystack' | 'stripe';

export interface InitializePaymentPayload {
  sessionId: string;
  provider: PaymentProvider;
  amountMinor: number;
  currency: string;
  customerEmail?: string;
}

export interface InitializePaymentResponse {
  paymentId: string;
  provider: PaymentProvider;
  providerReference: string;
  status: string;
  checkoutUrl?: string;
  clientSecret?: string;
}

export interface ProvisioningResponse {
  jobId: string;
  status: string;
  dropletId?: string;
  attemptCount: number;
}

export interface BootstrapResponse {
  jobId: string;
  status: string;
}

export interface TelegramAssignResponse {
  token: string;
}

export interface ActivityIngestPayload {
  sessionId: string;
  eventType: string;
  text: string;
  payload?: Record<string, unknown>;
}

export interface ActivityIngestResponse {
  eventId: string;
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
