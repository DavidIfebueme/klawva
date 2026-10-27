import { describe, expect, it } from "vitest";
import { publicListingQuery } from "../src/listings/catalog.ts";

describe("public catalog projection", () => {
  it("selects a display name and never the owner id", () => {
    expect(publicListingQuery).toContain("authorDisplay");
    expect(publicListingQuery).not.toContain("ownerId");
    expect(publicListingQuery).not.toContain("owner_id AS");
    expect(publicListingQuery).not.toContain("owner_email");
  });

  it("only lists published employees", () => {
    expect(publicListingQuery).toContain("status = 'published'");
  });

  it("never falls back to an email as the display name", () => {
    expect(publicListingQuery).not.toContain("email");
    expect(publicListingQuery).toContain("author_display");
  });
});
