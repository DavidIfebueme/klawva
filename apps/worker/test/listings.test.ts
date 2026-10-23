import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { bandFor, scoreTranscript } from "../src/eval/eval.ts";
import {
  encodeManifest,
  manifestFor,
  manifestHash,
} from "../src/listings/listings.ts";
import { definitions } from "../src/listings/definitions.ts";
import { ManifestJson, manifestOf } from "../src/db/schema.ts";
import { maxSecondsForBudget } from "../src/voice/ratecard.ts";
import { soulFor } from "../src/agent/souls.ts";

describe("eval bands", () => {
  it("bands scores", () => {
    expect(bandFor(90)).toBe("auto");
    expect(bandFor(70)).toBe("human");
    expect(bandFor(10)).toBe("reject");
  });

  it("scores an empty transcript as reject", () => {
    expect(bandFor(scoreTranscript(""))).toBe("reject");
  });

  it("scores a structured answer highly", () => {
    expect(
      scoreTranscript("Here is a table:\n| a | b |\nhttps://example.com"),
    ).toBeGreaterThanOrEqual(60);
  });
});

describe("manifest hash", () => {
  const content = (manifest: ReturnType<typeof manifestFor>) => ({
    manifest,
    briefFields: definitions[0].briefFields,
    toolAllowlist: ["fetch_url"],
    model: "m1",
    budgetMinor: 100,
  });

  it("is deterministic for the same version content", async () => {
    const manifest = manifestFor(definitions[0], "soul text");
    const first = await Effect.runPromise(manifestHash(content(manifest)));
    const second = await Effect.runPromise(manifestHash(content(manifest)));
    expect(first).toBe(second);
  });

  it("changes when the soul changes", async () => {
    const base = content(manifestFor(definitions[0], "soul text"));
    const edited = content(manifestFor(definitions[0], "soul text, edited"));
    const first = await Effect.runPromise(manifestHash(base));
    const changed = await Effect.runPromise(manifestHash(edited));
    expect(changed).not.toBe(first);
  });

  it("changes when a voice or phone block is added, so block edits cannot bypass versioning", async () => {
    const bare = content(manifestFor(definitions[0], "soul text"));
    const withVoice = content(
      manifestFor(
        { ...definitions[0], voice: { listen: true, speak: true } },
        "soul text",
      ),
    );
    const withPhone = content(
      manifestFor(
        {
          ...definitions[0],
          phone: { outbound: true, inbound: false, script: "hello" },
        },
        "soul text",
      ),
    );
    const bareHash = await Effect.runPromise(manifestHash(bare));
    const voiceHash = await Effect.runPromise(manifestHash(withVoice));
    const phoneHash = await Effect.runPromise(manifestHash(withPhone));
    expect(voiceHash).not.toBe(bareHash);
    expect(phoneHash).not.toBe(bareHash);
    expect(phoneHash).not.toBe(voiceHash);
  });

  it("changes when a desktop block toggles, so the desktop signal versions with the manifest", async () => {
    const cloud = content(manifestFor(definitions[0], "soul text"));
    const desktop = content(
      manifestFor(
        { ...definitions[0], desktop: { ownDevice: true } },
        "soul text",
      ),
    );
    const cloudHash = await Effect.runPromise(manifestHash(cloud));
    const desktopHash = await Effect.runPromise(manifestHash(desktop));
    expect(desktopHash).not.toBe(cloudHash);
  });

  it("changes with any version-level field, so two versions never silently share an audit hash", async () => {
    const base = content(manifestFor(definitions[0], "soul text"));
    const baseHash = await Effect.runPromise(manifestHash(base));
    for (const variant of [
      { ...base, budgetMinor: base.budgetMinor + 1 },
      { ...base, model: "m2" },
      { ...base, briefFields: [...base.briefFields, "extra"] },
      { ...base, toolAllowlist: [] },
    ]) {
      const hash = await Effect.runPromise(manifestHash(variant));
      expect(hash).not.toBe(baseHash);
    }
  });
});

describe("typed manifest", () => {
  it("encodes a soul-only manifest with no block keys", () => {
    const encoded = encodeManifest(manifestFor(definitions[0], "soul text"));
    expect(encoded).toBe('{"soul":"soul text"}');
  });

  it("decodes a stored manifest with blocks", () => {
    const manifest = manifestFor(
      {
        ...definitions[0],
        voice: { listen: true, speak: false, voiceId: "en-US-AvaNeural" },
      },
      "soul text",
    );
    const decoded = Schema.decodeUnknownSync(ManifestJson)(
      encodeManifest(manifest),
    );
    expect(decoded).toEqual(manifest);
  });

  it("rejects a manifest whose phone block is missing its script", () => {
    expect(() =>
      Schema.decodeUnknownSync(ManifestJson)(
        '{"soul":"x","phone":{"outbound":true,"inbound":false}}',
      ),
    ).toThrow();
  });

  it("reads an old row with no manifest column as soul only", () => {
    const manifest = manifestOf({ soul: "legacy soul", manifest: null });
    expect(manifest).toEqual({ soul: "legacy soul" });
  });

  it("reads a new row's manifest over its soul column", () => {
    const stored = encodeManifest({
      soul: "typed soul",
      phone: { outbound: true, inbound: true, script: "hi" },
    });
    const manifest = manifestOf({ soul: "typed soul", manifest: stored });
    expect(manifest.phone?.inbound).toBe(true);
  });
});

describe("phone listings", () => {
  const phones = definitions.filter((definition) => definition.phone !== undefined);

  it("ships the four phone employees, each with a launch market and a soul", () => {
    const ids = phones.map((definition) => definition.agentId).sort();
    expect(ids).toEqual([
      "appointmentsetter",
      "checkincaller",
      "followupcaller",
      "receptionist",
    ]);
    for (const definition of phones) {
      expect(definition.launchMarkets?.length).toBeGreaterThan(0);
      expect(soulFor(definition.agentId)).toContain("Klawva");
    }
  });

  it("keeps nigeria out of the receptionist until wholesale lands", () => {
    const receptionist = phones.find((definition) => definition.agentId === "receptionist");
    expect(receptionist?.launchMarkets).toEqual(["us", "in"]);
    expect(receptionist?.phone?.inbound).toBe(true);
    expect(receptionist?.phone?.outbound).toBe(false);
  });

  it("receptionist budget covers 25 hosted minutes a shift", () => {
    const receptionist = phones.find((definition) => definition.agentId === "receptionist");
    expect(receptionist).toBeDefined();
    expect(maxSecondsForBudget(receptionist!.budgetMinor, "bolna")).toBeGreaterThanOrEqual(25 * 60);
  });

  it("outbound budgets cover 15 nigerian minutes a shift, the worst market rail", () => {
    const outbound = phones.filter((definition) => definition.phone?.outbound === true);
    expect(outbound.length).toBe(3);
    for (const definition of outbound) {
      expect(maxSecondsForBudget(definition.budgetMinor, "twilio")).toBeGreaterThanOrEqual(15 * 60);
    }
  });

  it("prices phone shifts above the agreed 50 percent margin floor", () => {
    for (const definition of phones) {
      expect(definition.priceMinor).toBeGreaterThanOrEqual(
        Math.ceil(definition.budgetMinor * 1.5),
      );
    }
  });

  it("changes the manifest hash when launch markets change", async () => {
    const receptionist = phones.find((definition) => definition.agentId === "receptionist");
    const bare = manifestFor(receptionist!, "soul");
    const expanded = manifestFor(
      { ...receptionist!, launchMarkets: ["us", "in", "ng"] },
      "soul",
    );
    const bareHash = await Effect.runPromise(manifestHash(bare));
    const expandedHash = await Effect.runPromise(manifestHash(expanded));
    expect(expandedHash).not.toBe(bareHash);
  });
});
