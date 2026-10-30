import * as Schema from "effect/Schema";

const categoryVocabulary: Readonly<Record<string, string>> = {
  data: "data entry spreadsheets csv lists records clean up deduplicate export",
  research: "research sources report compare analysis look up find out",
  careers: "jobs job search cv resume applications interviews cover letter",
  sales: "leads outreach prospects pipeline follow up crm cold email",
  phone: "calls phone dial receptionist answer screen calls book appointments",
  desktop: "desktop app local files on my computer windows gmail email receipts invoices subscriptions",
  money: "invoices payments overdue chase clients subscriptions expenses bookkeeping",
};

const wordVocabulary: Readonly<Record<string, string>> = {
  invoice: "bill payment chase overdue client customer",
  receipt: "expense subscription renewal",
  email: "inbox message reply",
  admin: "paperwork forms filings",
  calendar: "schedule appointment booking",
  report: "summary write up analysis",
  lead: "prospect outreach follow up",
  hire: "recruit candidates interview",
};

const vocabularyWords = (text: string): ReadonlyArray<string> => {
  const words = new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const extra: Array<string> = [];
  for (const [key, value] of Object.entries(wordVocabulary)) {
    if (words.has(key)) {
      extra.push(value);
    }
  }
  return extra;
};

const BriefFields = Schema.fromJsonString(Schema.Array(Schema.String));

const briefLabels = (raw: string): ReadonlyArray<string> => {
  const decoded = Schema.decodeUnknownOption(BriefFields)(raw);
  return decoded._tag === "Some" ? decoded.value : [];
};

export interface ListingTextInput {
  readonly name: string;
  readonly tagline: string;
  readonly category: string;
  readonly briefFields: string;
  readonly soul: string;
}

export interface ListingText {
  readonly body: string;
  readonly embedding: string;
}

export const listingText = (input: ListingTextInput): ListingText => {
  const parts: Array<string> = [];
  const category = categoryVocabulary[input.category.toLowerCase()];
  if (category !== undefined) {
    parts.push(category);
  }
  const labels = briefLabels(input.briefFields);
  if (labels.length > 0) {
    parts.push(labels.join(" "));
  }
  parts.push(input.soul.slice(0, 600));
  const vocabulary = vocabularyWords(`${input.name} ${input.tagline} ${parts.join(" ")}`);
  if (vocabulary.length > 0) {
    parts.push(vocabulary.join(" "));
  }
  const body = parts.filter((part) => part.trim().length > 0).join(". ");
  return {
    body,
    embedding: `${input.name}. ${input.tagline}. ${body}`.trim(),
  };
};
