import { describe, expect, it } from "vitest";
import { toResponse } from "../src/adapter.ts";

describe("adapter", () => {
  it("serves /health", async () => {
    const response = await toResponse(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "klawva" });
  });

  it("returns 404 for an unknown route", async () => {
    const response = await toResponse(new Request("http://localhost/nope"));
    expect(response.status).toBe(404);
  });
});
