import { describe, expect, it } from "vitest";
import { isEmployeeRecipient, replyAddress } from "../src/channels/email.ts";
import { reportEmailHtml } from "../src/email/brevo.ts";

describe("email routing address", () => {
  it("accepts only the employee reply address", () => {
    expect(isEmployeeRecipient(replyAddress())).toBe(true);
    expect(isEmployeeRecipient(" Employees@Klawva.xyz ")).toBe(true);
    expect(isEmployeeRecipient("other@klawva.xyz")).toBe(false);
    expect(isEmployeeRecipient("employee-abc@mail.klawva.xyz")).toBe(false);
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
