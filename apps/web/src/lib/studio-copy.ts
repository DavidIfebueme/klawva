const manifestCopy: Readonly<Record<string, string>> = {
  dpia_required: "a third-party listing needs a DPIA note",
  data_policy_missing: "add a data policy to the manifest",
  retention_too_long: "retention cannot be longer than a year",
  hosted_block_missing: "add the agent card url",
  hosted_card_url_not_https: "the agent card url must be https",
  hosted_v1_is_web_only: "a hosted agent runs on the web transport",
  hosted_cannot_be_platform_metered: "a hosted listing is author metered",
  hosted_with_desktop_block: "a hosted listing cannot carry a desktop block",
  desktop_block_missing: "add the bundle id, entrypoint and data directories",
  desktop_data_dirs_empty: "declare at least one data directory",
  desktop_v1_requires_windows: "desktop bundles are windows only",
  desktop_v1_is_windows_only: "desktop bundles are windows only",
  desktop_with_hosted_block: "a desktop listing cannot carry a hosted block",
  desktop_cannot_be_platform_metered: "a desktop listing is author metered",
  authored_with_hosted_block: "an authored listing cannot declare a hosted runtime",
  authored_with_desktop_block: "an authored listing cannot declare a desktop runtime",
  authored_cannot_be_author_metered: "an authored listing runs on our budget",
  evidence_required_for_third_party: "third-party listings must require evidence",
  report_policy_without_runtime: "a report policy needs a runtime block",
  v2_blocks_on_v1_manifest: "the manifest needs the current schema version",
};

const manifestReason = (code: string): string => {
  const known = manifestCopy[code];
  if (known !== undefined) return known;
  if (code.startsWith("unknown_key:")) return `unknown field ${code.split(":")[1]}`;
  if (code.startsWith("unknown_hosted_key:")) {
    return `unknown hosted field ${code.split(":")[1]}`;
  }
  if (code.startsWith("unknown_desktop_key:")) {
    return `unknown desktop field ${code.split(":")[1]}`;
  }
  if (code.startsWith("unknown_limit_key:")) {
    return `unknown limit ${code.split(":")[1]}`;
  }
  if (code.startsWith("limit_invalid:")) {
    return `the ${code.split(":")[1]} limit is not a number`;
  }
  if (code.startsWith("limit_widened:")) {
    return `the ${code.split(":")[1]} limit is wider than the platform allows`;
  }
  return code;
};

const manifestReasons = (reason: string): string =>
  reason
    .slice("manifest:".length)
    .split(",")
    .map(manifestReason)
    .join("; ");

export const blockedCopy = (reason: string | null | undefined): string => {
  if (reason === null || reason === undefined || reason.length === 0) return "";
  if (reason === "kit_not_green") {
    return "Run the contract kit and get every step green before submitting.";
  }
  if (reason === "author_name_missing") {
    return "Set your author name in the studio before submitting.";
  }
  if (reason === "bundle_missing") {
    return "Upload a signed bundle for this version before submitting.";
  }
  if (reason === "listing_cap_reached") {
    return "You have used every listing in your tier.";
  }
  if (reason === "slug_taken") {
    return "That slug is already taken. Pick another.";
  }
  if (reason === "slug_format") {
    return "Use lowercase letters, numbers and single dashes in the slug.";
  }
  if (reason === "slug_length") {
    return "The slug must be 2 to 64 characters.";
  }
  if (reason === "bundle_unsigned") {
    return "The bundle needs a signature from your author key, and key registration is not open yet.";
  }
  if (reason === "bundle_signature_invalid") {
    return "The signature does not match the bundle file.";
  }
  if (reason === "bad_version") {
    return "Use a version like 1.2.0.";
  }
  if (reason.startsWith("manifest:")) {
    return `Fix the manifest: ${manifestReasons(reason)}`;
  }
  if (reason.startsWith("not_submittable:")) {
    return `This listing is ${reason.split(":")[1] ?? "locked"}, so it cannot be submitted.`;
  }
  if (reason.startsWith("not_editable:")) {
    return "This listing is in review, so it cannot be edited.";
  }
  return reason;
};
