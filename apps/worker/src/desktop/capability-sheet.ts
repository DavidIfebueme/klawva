import type { Manifest } from "../db/schema.ts";

export interface CapabilitySheet {
  readonly sentences: ReadonlyArray<string>;
  readonly privacyLine: string;
  readonly declared: boolean;
}

export const capabilitySentences = (manifest: Manifest): CapabilitySheet => {
  const desktop = manifest.runtime?.desktop;
  if (desktop === undefined) {
    return { sentences: [], privacyLine: "", declared: false };
  }
  const capabilities = desktop.capabilities;
  const sentences: string[] = [];

  if (capabilities.screen === "read") {
    sentences.push("It can see what is on your screen while it works.");
  }
  if (capabilities.input !== undefined && capabilities.input.length > 0) {
    sentences.push(
      `It can control your mouse and keyboard (${capabilities.input.join(", ")}).`,
    );
  }
  if (capabilities.fs !== undefined && capabilities.fs.includes("workspace")) {
    sentences.push("It can read and write files in the workspace folder you pick.");
  }
  if (desktop.network !== undefined && desktop.network.length > 0) {
    sentences.push(
      `It sends what it sees to ${desktop.network.join(", ")} to do the work.`,
    );
  }

  const declaresNetwork = (desktop.network ?? []).length > 0;
  const privacyLine = declaresNetwork
    ? "This employee talks to the internet. The hosts above are the only ones it declares."
    : "This employee stays on your machine and does not send anything out.";

  return { sentences, privacyLine, declared: true };
};
