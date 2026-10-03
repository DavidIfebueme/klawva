import * as Schema from "effect/Schema";

const CounterRow = Schema.Struct({ total: Schema.Number });

export class SessionCounter {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
  }

  async fetch(): Promise<Response> {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS counter (n INTEGER)");
    sql.exec("INSERT INTO counter (n) VALUES (1)");
    const { total } = Schema.decodeUnknownSync(CounterRow)(
      sql.exec("SELECT COALESCE(SUM(n), 0) AS total FROM counter").one(),
    );
    return Response.json({ count: total });
  }
}
