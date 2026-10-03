import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface McpTool {
  readonly name: string;
  readonly description: string;
}

export const rpcBody = (id: number, method: string, params: unknown): string =>
  JSON.stringify({ jsonrpc: "2.0", id, method, params });

const headers = (token: string): HeadersInit => ({
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${token}`,
});

const ToolList = Schema.Struct({
  result: Schema.optionalKey(
    Schema.Struct({
      tools: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          description: Schema.optionalKey(Schema.String),
        }),
      ),
    }),
  ),
});

export const listTools = (
  serverUrl: string,
  token: string,
): Effect.Effect<ReadonlyArray<McpTool>> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: headers(token),
        body: rpcBody(1, "tools/list", {}),
      });
      const body: unknown = await response.json();
      const decoded = Schema.decodeUnknownOption(ToolList)(body);
      if (decoded._tag === "None") {
        return [];
      }
      return (decoded.value.result?.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
      }));
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(Effect.catch(() => Effect.succeed([])));

export const callTool = (
  serverUrl: string,
  token: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Effect.Effect<string> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: headers(token),
        body: rpcBody(2, "tools/call", { name, arguments: args }),
      });
      const text = await response.text();
      return text.slice(0, 4000);
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(Effect.catch(() => Effect.succeed("")));
