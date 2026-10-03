import { describe, expect, it } from "vitest";
import { isEmployeeRecipient, replyAddress } from "../src/channels/email.ts";

describe("email routing address", () => {
  it("accepts only the employee reply address", () => {
    expect(isEmployeeRecipient(replyAddress())).toBe(true);
    expect(isEmployeeRecipient(" Employees@Klawva.xyz ")).toBe(true);
    expect(isEmployeeRecipient("other@klawva.xyz")).toBe(false);
    expect(isEmployeeRecipient("employee-abc@mail.klawva.xyz")).toBe(false);
  });
});
