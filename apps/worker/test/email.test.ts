import { describe, expect, it } from "vitest";
import {
  isEmployeeRecipient,
  replyAddress,
  sessionReplyAddress,
} from "../src/channels/email.ts";
import { reportEmailHtml } from "../src/email/brevo.ts";
import { magicLinkEmail } from "../src/email/templates.ts";

describe("email routing address", () => {
  it("accepts the shared reply address and tokenized session addresses", () => {
    expect(isEmployeeRecipient(replyAddress())).toBe(true);
    expect(isEmployeeRecipient(" Employees@Klawva.xyz ")).toBe(true);
    expect(isEmployeeRecipient(sessionReplyAddress("tok123"))).toBe(true);
    expect(isEmployeeRecipient("other@klawva.xyz")).toBe(false);
    expect(isEmployeeRecipient("employee-abc@mail.klawva.xyz")).toBe(false);
  });

  it("builds a session-bound tokenized reply address", () => {
    expect(sessionReplyAddress("abc123")).toBe("employees+abc123@klawva.xyz");
  });
});

describe("shift-ended email", () => {
  it("uses the branded template with a report link", () => {
    const html = reportEmailHtml("https://www.klawva.xyz/report/abc?shareToken=xyz");
    expect(html).toContain("KLAWVA");
    expect(html).toContain("https://www.klawva.xyz/report/abc?shareToken=xyz");
    expect(html).toContain("View your mission report");
  });
});

describe("magic link email", () => {
  it("never claims a studio login hired anyone", () => {
    const html = magicLinkEmail("https://www.klawva.xyz/x", "studio");
    expect(html).toContain("Klawva Studio");
    expect(html).not.toContain("hiring a Klawva employee");
  });

  it("addresses account logins to the account, not the studio", () => {
    const html = magicLinkEmail("https://www.klawva.xyz/x", "account");
    expect(html).toContain("your Klawva account");
    expect(html).not.toContain("Studio");
    expect(html).not.toContain("hiring a Klawva employee");
  });
});
