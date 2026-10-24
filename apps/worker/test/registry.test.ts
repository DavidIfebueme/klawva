import { describe, expect, it } from "vitest";
import {
  isKnownVoiceId,
  marketForNumber,
  resolveVoiceId,
  voiceFor,
} from "../src/voice/registry.ts";

describe("voice registry", () => {
  it("has a demo and production voice for every launch market", () => {
    for (const market of ["us", "in", "ng"] as const) {
      const entry = voiceFor(market);
      expect(entry.demo.length).toBeGreaterThan(0);
      expect(entry.production.length).toBeGreaterThan(0);
    }
  });

  it("maps the three country codes to their markets", () => {
    expect(marketForNumber("+2349066033744")).toBe("ng");
    expect(marketForNumber("+919876543210")).toBe("in");
    expect(marketForNumber("+17372508034")).toBe("us");
    expect(marketForNumber("+442071234567")).toBeNull();
  });

  it("follows the callee over the account market on phone calls", () => {
    const voice = resolveVoiceId({
      accountMarket: "ng",
      calleeNumber: "+17372508034",
    });
    expect(voice).toBe(voiceFor("us").demo);
  });

  it("falls back to the account market in the app, and to us when unset", () => {
    expect(resolveVoiceId({ accountMarket: "ng" })).toBe(voiceFor("ng").demo);
    expect(resolveVoiceId({ accountMarket: null })).toBe(voiceFor("us").demo);
  });

  it("lets a manifest voiceId win only when it is a known registry voice", () => {
    expect(
      resolveVoiceId({
        accountMarket: "us",
        manifestVoiceId: "en-NG-EzinneNeural",
      }),
    ).toBe("en-NG-EzinneNeural");
    expect(
      resolveVoiceId({
        accountMarket: "us",
        manifestVoiceId: "some-cloned-stranger",
      }),
    ).toBe(voiceFor("us").demo);
  });

  it("uses the production voice in production phase", () => {
    expect(
      resolveVoiceId({ accountMarket: "in", phase: "production" }),
    ).toBe(voiceFor("in").production);
  });

  it("knows which ids are in the registry", () => {
    expect(isKnownVoiceId("en-NG-EzinneNeural")).toBe(true);
    expect(isKnownVoiceId("not-a-voice")).toBe(false);
  });
});
