import { describe, expect, it } from "vitest";
import { rpcBody } from "../src/mcp/client.ts";

describe("mcp client", () => {
  it("builds a json-rpc request", () => {
    const body = JSON.parse(rpcBody(1, "tools/list", {})) as Record<string, unknown>;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tools/list");
    expect(body.id).toBe(1);
  });
});
