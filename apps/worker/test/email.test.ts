import { describe, expect, it } from "vitest";
import { replyAddress, sessionFromAddress } from "../src/channels/email.ts";

describe("email routing address", () => {
  it("extracts the session id from the local part", () => {
    expect(sessionFromAddress("employee-abc@mail.klawva.xyz")).toBe("abc");
    expect(sessionFromAddress("other@mail.klawva.xyz")).toBeNull();
    expect(sessionFromAddress("employee-@mail.klawva.xyz")).toBeNull();
  });

  it("round trips through the reply address", () => {
    expect(sessionFromAddress(replyAddress("abc"))).toBe("abc");
  });
});
