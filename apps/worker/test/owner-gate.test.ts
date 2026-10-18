import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { signToken } from "../src/auth/tokens.ts";
import {
  COOKIE_NAME,
  buildOwnerCookie,
  clearOwnerCookie,
  isPublicApiPath,
  ownerBlockedResponse,
  ownerGateEnabled,
  ownerTokenIsValid,
  ownerUnlockCookie,
  parseCookie,
} from "../src/lib/owner.ts";

const secret = "test-secret";
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

const ownerToken = async (exp: number): Promise<string> =>
  Effect.runPromise(signToken(secret, { email: "", exp, scope: "owner" }));

describe("owner gate", () => {
  it("is enabled only for an explicit true flag and a non-empty key", () => {
    expect(ownerGateEnabled("true", "key")).toBe(true);
    expect(ownerGateEnabled("true", "")).toBe(false);
    expect(ownerGateEnabled("false", "key")).toBe(false);
    expect(ownerGateEnabled("", "key")).toBe(false);
    expect(ownerGateEnabled("1", "key")).toBe(false);
  });

  it("treats health, config and listings as public", () => {
    expect(isPublicApiPath("/health")).toBe(true);
    expect(isPublicApiPath("/api/config")).toBe(true);
    expect(isPublicApiPath("/api/listings")).toBe(true);
    expect(isPublicApiPath("/api/listings/some-slug")).toBe(true);
  });

  it("treats session, payment and slack endpoints as gated", () => {
    expect(isPublicApiPath("/api/sessions")).toBe(false);
    expect(isPublicApiPath("/api/payments/initialize")).toBe(false);
    expect(isPublicApiPath("/api/slack/events")).toBe(false);
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

  it("clears the owner cookie immediately", () => {
    expect(clearOwnerCookie()).toContain("Max-Age=0");
    expect(parseCookie(clearOwnerCookie(), COOKIE_NAME)).toBe("");
  });

  it("accepts only a live owner-scoped token", async () => {
    expect(await ownerTokenIsValid(secret, await ownerToken(future))).toBe(true);
    const slack = await Effect.runPromise(
      signToken(secret, { email: "", exp: future, scope: "slack_oauth" }),
    );
    expect(await ownerTokenIsValid(secret, slack)).toBe(false);
    expect(await ownerTokenIsValid(secret, null)).toBe(false);
    expect(await ownerTokenIsValid(secret, "garbage")).toBe(false);
    expect(await ownerTokenIsValid(secret, await ownerToken(past))).toBe(false);
  });

  it("blocks with a private testing response", () => {
    const response = ownerBlockedResponse();
    expect(response.status).toBe(403);
  });

  it("mints an owner cookie only for the exact configured key", async () => {
    const cookie = await ownerUnlockCookie(secret, "s3cret", "s3cret");
    expect(cookie).not.toBe(null);
    const token = parseCookie(cookie ?? "", COOKIE_NAME);
    expect(await ownerTokenIsValid(secret, token)).toBe(true);
    expect(await ownerUnlockCookie(secret, "s3cret", "wrong")).toBe(null);
    expect(await ownerUnlockCookie(secret, "", "s3cret")).toBe(null);
    expect(await ownerUnlockCookie(secret, undefined, "s3cret")).toBe(null);
  });
});
