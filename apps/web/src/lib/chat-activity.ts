import type { UIMessage } from "ai";

export const toolDisplayName = (name: string): string =>
  name.replace(/_/g, " ");

export const toolInputDetail = (input: unknown): string => {
  if (typeof input !== "object" || input === null) {
    return "";
  }
  if (
    "query" in input &&
    typeof input.query === "string" &&
    input.query.length > 0
  ) {
    return input.query;
  }
  if (
    "url" in input &&
    typeof input.url === "string" &&
    input.url.length > 0
  ) {
    const parsed = URL.parse(input.url);
    return parsed === null ? input.url : parsed.hostname;
  }
  return "";
};

export const toolActivityLine = (
  name: string,
  state: string,
  detail: string,
): string | null => {
  const verbs: Record<string, [string, string]> = {
    web_search: ["Searching", "Searched"],
    fetch_url: ["Fetching", "Fetched"],
    extract_links: ["Extracting links from", "Extracted links from"],
  };
  const label = toolDisplayName(name);
  const suffix = detail.length > 0 ? ` ${detail}` : "";
  if (state === "output-error") {
    return `${label}${suffix} failed`;
  }
  if (state === "output-available") {
    return `${verbs[name]?.[1] ?? `Finished ${label}`}${suffix}`;
  }
  if (state === "input-streaming" || state === "input-available") {
    return `${verbs[name]?.[0] ?? `Running ${label}`}${suffix}…`;
  }
  return null;
};

export const toolActivity = (
  message: UIMessage,
): ReadonlyArray<string> => {
  const lines: string[] = [];
  for (const part of message.parts) {
    if (part.type !== "dynamic-tool" && !part.type.startsWith("tool-")) {
      continue;
    }
    const name =
      part.type === "dynamic-tool" &&
      "toolName" in part &&
      typeof part.toolName === "string"
        ? part.toolName
        : part.type.slice("tool-".length);
    const state =
      "state" in part && typeof part.state === "string" ? part.state : "";
    const detail = "input" in part ? toolInputDetail(part.input) : "";
    const line = toolActivityLine(name, state, detail);
    if (line !== null) {
      lines.push(line);
    }
  }
  return lines;
};
