import { describe, expect, it } from "vitest";
import {
  buildAuthUrl,
  buildDraftRaw,
  gmailScopes,
  googleClientId,
  newPkceVerifier,
  newState,
  pkceChallenge,
} from "../src/client/gmail.ts";

describe("pkce", () => {
  it("makes a fresh verifier and state every time", () => {
    expect(newPkceVerifier()).not.toBe(newPkceVerifier());
    expect(newState()).not.toBe(newState());
  });

  it("hashes the verifier into the challenge, deterministically", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const first = await pkceChallenge(verifier);
    const second = await pkceChallenge(verifier);
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first).not.toContain(verifier);
  });
});

describe("auth url", () => {
  it("carries the s256 challenge, state, and the draft plus read scopes", async () => {
    const url = buildAuthUrl({
      challenge: "ch",
      state: "st",
      redirectUri: "http://127.0.0.1:9999",
    });
    expect(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(url).toContain("code_challenge=ch");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("state=st");
    expect(url).toContain("access_type=offline");
    for (const scope of gmailScopes) {
      expect(url).toContain(encodeURIComponent(scope));
    }
  });

  it("asks for read and draft, never send", () => {
    expect(gmailScopes.join(" ")).toContain("gmail.readonly");
    expect(gmailScopes.join(" ")).toContain("gmail.compose");
    expect(gmailScopes.join(" ")).not.toContain("gmail.send");
  });

  it("reads the client id from env, never a committed value", () => {
    expect(googleClientId).not.toContain("apps.googleusercontent.com");
  });
});

describe("draft raw", () => {
  it("builds an rfc822 message with reply headers when replying", () => {
    const raw = buildDraftRaw({
      to: "a@b.com",
      subject: "re: hi",
      body: "thanks, got it",
      inReplyTo: "<m1@x>",
      references: "<m0@x> <m1@x>",
    });
    const decoded = decodeURIComponent(
      escape(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))),
    );
    expect(decoded).toContain("To: a@b.com");
    expect(decoded).toContain("Subject: re: hi");
    expect(decoded).toContain("In-Reply-To: <m1@x>");
    expect(decoded).toContain("References: <m0@x> <m1@x>");
    expect(decoded).toContain("thanks, got it");
  });

  it("is url safe base64 with no padding", () => {
    const raw = buildDraftRaw({ to: "a@b.com", subject: "s", body: "b" });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
