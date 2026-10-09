import * as Effect from "effect/Effect";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { toolRegistry } from "../agent/runtime.ts";

const urlInput = z.object({ url: z.string() });
const queryInput = z.object({ query: z.string() });

const inputSchemas: Record<string, z.ZodType> = {
  fetch_url: urlInput,
  extract_links: urlInput,
  web_search: queryInput,
};

export const aiToolsFor = (
  allowlist: ReadonlyArray<string>,
  sessionId: string,
  braveKey: string,
): ToolSet => {
  const tools: ToolSet = {};
  for (const definition of toolRegistry) {
    if (!allowlist.includes(definition.name)) {
      continue;
    }
    const execute = definition.execute;
    const inputSchema = inputSchemas[definition.name] ?? urlInput;
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema,
      execute: async (args) =>
        Effect.runPromise(
          execute(JSON.stringify(args), { sessionId, braveKey }),
        ).catch(
          (cause: unknown) => `tool failed: ${String(cause).slice(0, 200)}`,
        ),
    });
  }
  return tools;
};
