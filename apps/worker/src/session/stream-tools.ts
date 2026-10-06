import * as Effect from "effect/Effect";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { toolRegistry } from "../agent/runtime.ts";

const urlInput = z.object({ url: z.string() });

export const aiToolsFor = (
  allowlist: ReadonlyArray<string>,
  sessionId: string,
): ToolSet => {
  const tools: ToolSet = {};
  for (const definition of toolRegistry) {
    if (!allowlist.includes(definition.name)) {
      continue;
    }
    const execute = definition.execute;
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema: urlInput,
      execute: async (args) =>
        Effect.runPromise(execute(JSON.stringify(args), { sessionId })).catch(
          (cause: unknown) => `tool failed: ${String(cause).slice(0, 200)}`,
        ),
    });
  }
  return tools;
};
