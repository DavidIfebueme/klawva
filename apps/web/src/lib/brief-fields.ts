export interface BriefFieldSpec {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly type: "text" | "textarea" | "tel" | "file" | "select";
  readonly required: boolean;
  readonly options?: ReadonlyArray<string>;
  readonly hint?: string;
}

const labels: Readonly<Record<string, string>> = {
  task: "What should it do?",
  urls: "Links to work from (optional)",
  output: "How should the result look?",
  topic: "What should it investigate?",
  depth: "How deep should it go?",
  context: "Anything else it should know? (optional)",
  role_preference: "What roles are you after?",
  location: "Where, or remote?",
  salary_range: "Salary range",
  extra_criteria: "Anything else that matters? (optional)",
  cv_file: "Your CV",
  postings: "Job links to tailor for (optional)",
  ideal_customer: "Who is the ideal customer?",
  industry: "Industry",
  contact_preference: "How should leads be contacted?",
  business_facts: "Facts about the business",
  calendar_rules: "Booking rules",
  escalation_contact: "Who to escalate to",
  invoice_list: "Invoices to chase",
  owner_tone_notes: "Tone for the calls",
  approved_consequences: "What it may say or offer",
  customer_list: "Customers to call",
  service_summary: "What the service is",
  rebooking_rules: "Rebooking rules",
  focus: "What should it focus on?",
  tone_notes: "How should it sound?",
  approval_mode: "Draft only, or may send?",
  statements_folder: "Folder with statements",
  receipts_in_mail: "Receipts in email?",
  focus_merchants: "Merchants to watch",
  process_folder: "Folder with the paperwork",
  personal_facts: "Facts to fill in",
  deadline_zone: "Timezone for deadlines",
  subject: "Subject to study",
  material_folder: "Folder with the material",
  level: "Level",
};

const placeholders: Readonly<Record<string, string>> = {
  task: "e.g. Read the pricing page and tell me every plan and its cap",
  urls: "One per line",
  output: "e.g. A short table",
  topic: "e.g. How Paystack test mode differs from live mode",
  depth: "e.g. Three sources, short report",
  location: "e.g. Lagos or remote",
  salary_range: "e.g. 800k to 1.5m monthly",
  ideal_customer: "e.g. Small restaurants in Lagos with a website",
  industry: "e.g. food",
  business_facts: "Hours, location, what you sell",
  calendar_rules: "e.g. 30 minute slots, Mon to Fri",
  escalation_contact: "A name and a number",
  customer_list: "One per line, with a phone number",
  focus_merchants: "e.g. AWS, DSTV, Netflix",
  process_folder: "e.g. ~/Documents/forms",
  statements_folder: "e.g. ~/Downloads",
  subject: "e.g. Nigerian company law basics",
};

const humanize = (value: string): string =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export const briefField = (name: string): BriefFieldSpec => ({
  id: name,
  label: labels[name] ?? humanize(name),
  placeholder: placeholders[name] ?? "",
  type: name.endsWith("_file") ? "file" : "textarea",
  required: true,
});
