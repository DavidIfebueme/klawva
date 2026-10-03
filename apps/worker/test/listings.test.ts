import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { bandFor, scoreTranscript } from "../src/eval/eval.ts";
import { manifestHash } from "../src/listings/listings.ts";
import { definitions } from "../src/listings/definitions.ts";

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
  it("is deterministic and changes with content", async () => {
    const base = definitions[0];
    const first = await Effect.runPromise(manifestHash(base));
    const second = await Effect.runPromise(manifestHash(base));
    const changed = await Effect.runPromise(
      manifestHash({ ...base, priceMinor: base.priceMinor + 1 }),
    );
    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });
});
