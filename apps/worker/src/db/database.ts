import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

export type Param = string | number | null;
export type Row = Readonly<Record<string, unknown>>;

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface DatabaseImpl {
  readonly all: (
    sql: string,
    params?: ReadonlyArray<Param>,
  ) => Effect.Effect<ReadonlyArray<Row>, DatabaseError>;
  readonly first: (
    sql: string,
    params?: ReadonlyArray<Param>,
  ) => Effect.Effect<Row | null, DatabaseError>;
  readonly run: (
    sql: string,
    params?: ReadonlyArray<Param>,
  ) => Effect.Effect<void, DatabaseError>;
}

export class Database extends Context.Service<Database, DatabaseImpl>()(
  "klawva/db/Database",
) {}

const bind = (d1: D1Database, sql: string, params?: ReadonlyArray<Param>) => {
  const statement = d1.prepare(sql);
  return params ? statement.bind(...params) : statement;
};

export const make = (d1: D1Database): DatabaseImpl => ({
  all: (sql, params) =>
    Effect.tryPromise({
      try: async () => {
        const result = await bind(d1, sql, params).all();
        return result.results;
      },
      catch: (cause) => new DatabaseError({ operation: sql, cause }),
    }),
  first: (sql, params) =>
    Effect.tryPromise({
      try: async () => {
        const row = await bind(d1, sql, params).first();
        return row ?? null;
      },
      catch: (cause) => new DatabaseError({ operation: sql, cause }),
    }),
  run: (sql, params) =>
    Effect.tryPromise({
      try: async () => {
        await bind(d1, sql, params).run();
      },
      catch: (cause) => new DatabaseError({ operation: sql, cause }),
    }),
});

export const layer = (d1: D1Database): Layer.Layer<Database> =>
  Layer.succeed(Database)(make(d1));
