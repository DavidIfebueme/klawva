export interface Connector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const connectors: ReadonlyArray<Connector> = [
  { id: "slack", name: "Slack", description: "Post and read in a Slack workspace." },
  { id: "sheets", name: "Sheets", description: "Read and write spreadsheet rows." },
  { id: "gmail", name: "Gmail", description: "Send and read email." },
  { id: "github", name: "GitHub", description: "Read repositories and open issues." },
  { id: "notion", name: "Notion", description: "Read and write pages and databases." },
];
