import type { Manifest } from "../db/schema.ts";

export const capabilitySheet = (manifest: Manifest): string[] => {
  const runtime = manifest.runtime;
  if (runtime === undefined || runtime.kind === "authored") {
    return [];
  }
  if (runtime.kind === "hosted") {
    return ["work runs on the author's server, not on klawva"];
  }
  const desktop = runtime.desktop;
  if (desktop === undefined) {
    return [];
  }
  const capabilities = desktop.capabilities;
  const sentences: string[] = [];
  if (capabilities.screen === "read") {
    sentences.push("reads what is on your screen");
  }
  if (capabilities.input !== undefined && capabilities.input.length > 0) {
    sentences.push("can click and type for you");
  }
  const hosts = desktop.network ?? capabilities.network ?? [];
  if (hosts.length > 0) {
    sentences.push(`sends data to ${hosts.join(", ")}`);
  }
  if (capabilities.fs !== undefined && capabilities.fs.length > 0) {
    sentences.push("reads files only in the folder you pick");
  }
  if (desktop.dataDirs.length > 0) {
    sentences.push(`stores its data in ${desktop.dataDirs.join(", ")}`);
  }
  if (hosts.length === 0) {
    sentences.push("stays on your machine");
  }
  return sentences;
};
