import { AgentId } from '@/lib/agents';

export interface SessionStatusResponse {
  status: 'provisioning' | 'ready' | 'active' | 'completed';
  connected?: boolean;
}

export interface SessionQRResponse {
  qr: string;
  expiresIn: number;
  whatsappNumber?: string;
  waMeLink?: string;
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

export interface ActivateSessionResponse {
  status: string;
  startedAt?: string;
  endsAt?: string;
  qr?: string;
  expiresIn?: number;
  telegramToken?: string;
  telegramDeepLink?: string;
  whatsappNumber?: string;
  waMeLink?: string;
}

export type PaymentProvider = 'paystack' | 'stripe';

export interface InitializePaymentPayload {
  sessionId: string;
  provider?: PaymentProvider;
  amountMinor?: number;
  currency?: string;
  customerEmail?: string;
}

export interface InitializePaymentResponse {
  paymentId: string;
  provider: PaymentProvider;
  providerReference: string;
  status: string;
  amountMinor: number;
  currency: string;
  checkoutUrl?: string;
  clientSecret?: string;
}

export interface BillingProfile {
  provider: PaymentProvider;
  amountMinor: number;
  currency: string;
  amountDisplay: string;
  region: 'nigeria' | 'global';
  countryCode?: string | null;
}

export interface ProvisioningResponse {
  jobId: string;
  status: string;
  agentIdInGateway?: string;
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
  sessionToken: string;
}

export interface RequestHistoryLinkResponse {
  sent: boolean;
}

export interface ContactEmailPayload {
  subject: string;
  body: string;
  replyTo?: string;
}

export interface SendEmailResponse {
  sent: boolean;
}

export interface HistorySessionItem {
  sessionId: string;
  agentId: AgentId;
  channel: 'whatsapp' | 'telegram';
  status: string;
  startedAt?: string;
  endsAt?: string;
  completedAt?: string;
}

export interface HistorySessionsResponse {
  sessions: HistorySessionItem[];
}
