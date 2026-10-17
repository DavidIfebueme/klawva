import { describe, expect, it } from "vitest";
import {
  isEmployeeRecipient,
  replyAddress,
  sessionReplyAddress,
} from "../src/channels/email.ts";
import { reportEmailHtml } from "../src/email/brevo.ts";
import { magicLinkEmail, shiftStartedEmail } from "../src/email/templates.ts";

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

describe("shift-started email", () => {
  const start = "2026-10-17T10:00:00.000Z";
  const end = "2026-10-19T10:00:00.000Z";

  it("points web sessions at their account, with no token in the email", () => {
    const html = shiftStartedEmail("Lead Scout", start, end, undefined, "web");
    expect(html).toContain("Open your Klawva account");
    expect(html).not.toContain("Telegram");
    expect(html).not.toContain("token=");
  });

  it("tells email sessions to reply", () => {
    const html = shiftStartedEmail("Lead Scout", start, end, undefined, "email");
    expect(html).toContain("Reply to this email to give it instructions");
    expect(html).not.toContain("Telegram");
  });

  it("tells telegram sessions to message the bot", () => {
    const html = shiftStartedEmail("Lead Scout", start, end, undefined, "telegram");
    expect(html).toContain("Telegram");
  });

  it("shows the opening reply when the employee opened", () => {
    const html = shiftStartedEmail("Lead Scout", start, end, "On it.", "web");
    expect(html).toContain("On it.");
    expect(html).toContain("Reply to this email to redirect it");
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
