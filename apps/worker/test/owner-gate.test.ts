import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { signToken } from "../src/auth/tokens.ts";
import {
  COOKIE_NAME,
  buildOwnerCookie,
  isPublicApiPath,
  ownerBlockedResponse,
  ownerGateEnabled,
  ownerSigningSecret,
  ownerTokenIsValid,
  ownerUnlockCookie,
  ownerUnlockPage,
  parseCookie,
  signatureVerifiedApiPath,
  unlockKeyFromRequest,
} from "../src/lib/owner.ts";

const secret = "test-secret";
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

const ownerToken = async (
  ownerKey: string,
  exp: number,
  scope = "owner",
): Promise<string> =>
  Effect.runPromise(
    signToken(ownerSigningSecret(secret, ownerKey), { email: "", exp, scope }),
  );

describe("owner gate", () => {
  it("is enabled only for an explicit true flag and a non-empty key", () => {
    expect(ownerGateEnabled("true", "key")).toBe(true);
    expect(ownerGateEnabled("true", "")).toBe(false);
    expect(ownerGateEnabled("true", undefined)).toBe(false);
    expect(ownerGateEnabled("false", "key")).toBe(false);
    expect(ownerGateEnabled(undefined, "key")).toBe(false);
    expect(ownerGateEnabled("1", "key")).toBe(false);
  });

  it("keeps config and listings public", () => {
    expect(isPublicApiPath("/api/config")).toBe(true);
    expect(isPublicApiPath("/api/listings")).toBe(true);
    expect(isPublicApiPath("/api/listings/some-slug")).toBe(true);
  });

  it("gates session, payment and slack oauth endpoints", () => {
    expect(isPublicApiPath("/api/sessions")).toBe(false);
    expect(isPublicApiPath("/api/payments/initialize")).toBe(false);
    expect(isPublicApiPath("/api/slack/install")).toBe(false);
  });

  it("exempts only the signature-verified api paths", () => {
    expect(signatureVerifiedApiPath("/api/discord/interactions")).toBe(true);
    expect(signatureVerifiedApiPath("/api/slack/events")).toBe(true);
    expect(signatureVerifiedApiPath("/api/slack/install")).toBe(false);
    expect(signatureVerifiedApiPath("/api/slack/oauth")).toBe(false);
    expect(signatureVerifiedApiPath("/api/sessions")).toBe(false);
  });

  it("reads a named cookie out of a multi-cookie header", () => {
    const header = "other=1; klawva_owner=abc.def; theme=dark";
    expect(parseCookie(header, "klawva_owner")).toBe("abc.def");
    expect(parseCookie(header, "theme")).toBe("dark");
    expect(parseCookie(header, "missing")).toBe(null);
    expect(parseCookie(null, "klawva_owner")).toBe(null);
  });

  it("round trips the token through the owner cookie", () => {
    const cookie = buildOwnerCookie("abc.def");
    expect(parseCookie(cookie, COOKIE_NAME)).toBe("abc.def");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=7776000");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("accepts only a live owner-scoped token", async () => {
    expect(
      await ownerTokenIsValid(secret, "keyA", await ownerToken("keyA", future)),
    ).toBe(true);
    expect(
      await ownerTokenIsValid(
        secret,
        "keyA",
        await ownerToken("keyA", future, "slack_oauth"),
      ),
    ).toBe(false);
    expect(await ownerTokenIsValid(secret, "keyA", null)).toBe(false);
    expect(await ownerTokenIsValid(secret, "keyA", "garbage")).toBe(false);
    expect(
      await ownerTokenIsValid(secret, "keyA", await ownerToken("keyA", past)),
    ).toBe(false);
  });

  it("revokes issued cookies when the owner key rotates", async () => {
    const cookie = await ownerUnlockCookie(secret, "keyA", "keyA");
    const token = parseCookie(cookie ?? "", COOKIE_NAME);
    expect(await ownerTokenIsValid(secret, "keyA", token)).toBe(true);
    expect(await ownerTokenIsValid(secret, "keyB", token)).toBe(false);
  });

  it("mints an owner cookie only for the exact configured key", async () => {
    const cookie = await ownerUnlockCookie(secret, "s3cret", "s3cret");
    expect(cookie).not.toBe(null);
    const token = parseCookie(cookie ?? "", COOKIE_NAME);
    expect(await ownerTokenIsValid(secret, "s3cret", token)).toBe(true);
    expect(await ownerUnlockCookie(secret, "s3cret", "wrong")).toBe(null);
    expect(await ownerUnlockCookie(secret, "", "s3cret")).toBe(null);
    expect(await ownerUnlockCookie(secret, undefined, "s3cret")).toBe(null);
  });

  it("blocks with a private testing response", () => {
    expect(ownerBlockedResponse().status).toBe(403);
  });

  it("reads the unlock key from a form body and treats other bodies as empty", async () => {
    const form = new Request("https://x/owner/unlock", {
      method: "POST",
      body: new URLSearchParams({ key: "s3cret" }),
    });
    expect(await unlockKeyFromRequest(form)).toBe("s3cret");

    const json = new Request("https://x/owner/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"key":"s3cret"}',
    });
    expect(await unlockKeyFromRequest(json)).toBe("");

    const empty = new Request("https://x/owner/unlock", { method: "POST" });
    expect(await unlockKeyFromRequest(empty)).toBe("");

    const badMultipart = new Request("https://x/owner/unlock", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "x",
    });
    expect(await unlockKeyFromRequest(badMultipart)).toBe("");
  });

  it("serves the unlock form", async () => {
    const response = ownerUnlockPage();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('action="/owner/unlock"');
  });
});
