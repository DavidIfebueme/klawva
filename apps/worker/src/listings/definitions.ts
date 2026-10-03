export interface ListingDefinition {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly category: string;
  readonly agentId: string;
  readonly briefFields: ReadonlyArray<string>;
  readonly priceMinor: number;
}

export const definitions: ReadonlyArray<ListingDefinition> = [
  {
    slug: "scrapper",
    name: "Klawva Scrapper",
    tagline: "Web intelligence and data.",
    category: "data",
    agentId: "scrapper",
    briefFields: ["task", "urls", "output"],
    priceMinor: 1500,
  },
  {
    slug: "researcher",
    name: "Klawva Researcher",
    tagline: "Multi-source research reports.",
    category: "research",
    agentId: "researcher",
    briefFields: ["topic", "depth", "context"],
    priceMinor: 2500,
  },
  {
    slug: "jobseeker",
    name: "Klawva Job Seeker",
    tagline: "Finds and ranks job openings.",
    category: "careers",
    agentId: "jobseeker",
    briefFields: ["role_preference", "location", "salary_range", "extra_criteria"],
    priceMinor: 1500,
  },
  {
    slug: "leadscout",
    name: "Klawva Lead Scout",
    tagline: "Finds and qualifies leads.",
    category: "sales",
    agentId: "leadscout",
    briefFields: ["ideal_customer", "industry", "contact_preference", "extra_criteria"],
    priceMinor: 2500,
  },
];
