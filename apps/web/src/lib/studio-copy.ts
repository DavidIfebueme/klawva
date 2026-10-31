const manifestReasons = (reason: string): string =>
  reason
    .slice("manifest:".length)
    .split(",")
    .join(", ");

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
