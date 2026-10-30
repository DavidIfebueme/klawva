import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";
import { lexicalHits } from "./lexical.ts";
import { parseQuery } from "./query.ts";
import { rankListings, type Ranked, type Searchable } from "./rank.ts";
import { semanticHits } from "./semantic.ts";

export const searchCatalog = (
  env: Env,
  db: DatabaseImpl,
  rows: ReadonlyArray<Searchable>,
  raw: string,
): Effect.Effect<ReadonlyArray<Ranked>> =>
  Effect.gen(function* () {
    const parsed = parseQuery(raw);
    if (parsed === null) {
      return [];
    }
    const [lexical, semantic] = yield* Effect.all(
      [lexicalHits(db, parsed), semanticHits(env, db, parsed.phrase)],
      { concurrency: "unbounded" },
    );
    return rankListings({ rows, lexical, semantic, phrase: parsed.phrase });
  });
