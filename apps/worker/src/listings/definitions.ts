import type { DesktopManifest, LaunchMarket, PhoneManifest, VoiceManifest } from "../db/schema.ts";

export interface ListingDefinition {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly category: string;
  readonly agentId: string;
  readonly briefFields: ReadonlyArray<string>;
  readonly priceMinor: number;
  readonly budgetMinor: number;
  readonly voice?: VoiceManifest;
  readonly phone?: PhoneManifest;
  readonly desktop?: DesktopManifest;
  readonly launchMarkets?: ReadonlyArray<LaunchMarket>;
}

export const definitions: ReadonlyArray<ListingDefinition> = [
  {
    slug: "scrapper",
    name: "Klawva Scrapper",
    tagline: "Web intelligence and data.",
    category: "data",
    agentId: "scrapper",
    briefFields: ["task", "urls", "output"],
    priceMinor: 300000,
    budgetMinor: 3000,
  },
  {
    slug: "researcher",
    name: "Klawva Researcher",
    tagline: "Multi-source research reports.",
    category: "research",
    agentId: "researcher",
    briefFields: ["topic", "depth", "context"],
    priceMinor: 750000,
    budgetMinor: 10000,
  },
  {
    slug: "jobseeker",
    name: "Klawva Job Seeker",
    tagline: "Finds and ranks job openings.",
    category: "careers",
    agentId: "jobseeker",
    briefFields: ["role_preference", "location", "salary_range", "extra_criteria"],
    priceMinor: 100000,
    budgetMinor: 600,
  },
  {
    slug: "leadscout",
    name: "Klawva Lead Scout",
    tagline: "Finds and qualifies leads.",
    category: "sales",
    agentId: "leadscout",
    briefFields: ["ideal_customer", "industry", "contact_preference", "extra_criteria"],
    priceMinor: 300000,
    budgetMinor: 3000,
  },
  {
    slug: "receptionist",
    name: "Klawva Receptionist",
    tagline: "Answers your business line.",
    category: "phone",
    agentId: "receptionist",
    briefFields: ["business_facts", "calendar_rules", "escalation_contact"],
    priceMinor: 1500000,
    budgetMinor: 450000,
    phone: {
      outbound: false,
      inbound: true,
      script:
        "You answer the business line. Announce yourself as an AI, say the call is transcribed, then help from the business facts only.",
    },
    launchMarkets: ["us", "in"],
  },
  {
    slug: "appointmentsetter",
    name: "Klawva Appointment Setter",
    tagline: "Calls your customers to book and confirm.",
    category: "phone",
    agentId: "appointmentsetter",
    briefFields: ["calendar_rules", "customer_list", "call_window"],
    priceMinor: 1200000,
    budgetMinor: 650000,
    phone: {
      outbound: true,
      inbound: false,
      script:
        "You call the business's own customers to book, confirm, or reschedule. Announce yourself as an AI, say the call is transcribed, then offer real slots from the calendar rules.",
    },
    launchMarkets: ["us", "in", "ng"],
  },
  {
    slug: "followupcaller",
    name: "Klawva Follow Up Caller",
    tagline: "Chases invoices and shares updates, politely.",
    category: "phone",
    agentId: "followupcaller",
    briefFields: ["invoice_list", "owner_tone_notes", "approved_consequences"],
    priceMinor: 1200000,
    budgetMinor: 650000,
    phone: {
      outbound: true,
      inbound: false,
      script:
        "You call about unpaid invoices or delivery updates in the owner's tone. Announce yourself as an AI, say the call is transcribed, state the exact amount or update from the brief, and make one clear ask.",
    },
    launchMarkets: ["us", "in", "ng"],
  },
  {
    slug: "checkincaller",
    name: "Klawva Check In Caller",
    tagline: "Scheduled care calls for your customers.",
    category: "phone",
    agentId: "checkincaller",
    briefFields: ["customer_list", "service_summary", "rebooking_rules"],
    priceMinor: 1200000,
    budgetMinor: 650000,
    phone: {
      outbound: true,
      inbound: false,
      script:
        "You make scheduled care calls. Announce yourself as an AI, say the call is transcribed, ask how the service went, and offer a rebooking only when the rules allow.",
    },
    launchMarkets: ["us", "in", "ng"],
  },
];
