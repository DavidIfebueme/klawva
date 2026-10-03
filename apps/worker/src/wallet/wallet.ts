import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServer } from "effect/http";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpServerError from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

export const canDebit = (balanceMinor: number, amountMinor: number): boolean =>
  balanceMinor - amountMinor >= 0;

const readMeta = (sql: SqlStorage, key: string): string | null => {
  const rows = sql.exec("SELECT value FROM wallet_meta WHERE key = ?", key).toArray();
  return rows[0] ? String(rows[0].value) : null;
};

const referenceExists = (sql: SqlStorage, reference: string): boolean =>
  sql
    .exec("SELECT 1 FROM wallet_txns WHERE reference = ? LIMIT 1", reference)
    .toArray().length > 0;

export interface WalletStoreImpl {
  readonly balance: () => Effect.Effect<number>;
  readonly credit: (
    amountMinor: number,
    reference: string,
    description: string,
  ) => Effect.Effect<number>;
  readonly debit: (
    amountMinor: number,
    reference: string,
    description: string,
  ) => Effect.Effect<number | null>;
}

export class WalletStore extends Context.Service<WalletStore, WalletStoreImpl>()(
  "klawva/wallet/WalletStore",
) {}

const writeTxn = (
  sql: SqlStorage,
  type: string,
  amountMinor: number,
  reference: string,
  description: string,
  balanceAfter: number,
): void => {
  sql.exec(
    "INSERT INTO wallet_txns (id, type, amount_minor, reference, description, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    type,
    amountMinor,
    reference,
    description,
    balanceAfter,
    new Date().toISOString(),
  );
};

const setBalance = (sql: SqlStorage, value: number): void => {
  sql.exec(
    "INSERT INTO wallet_meta (key, value) VALUES ('balance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(value),
  );
};

export const makeStore = (sql: SqlStorage): WalletStoreImpl => ({
  balance: () => Effect.sync(() => Number(readMeta(sql, "balance") ?? "0")),
  credit: (amountMinor, reference, description) =>
    Effect.sync(() => {
      const current = Number(readMeta(sql, "balance") ?? "0");
      if (referenceExists(sql, reference)) {
        return current;
      }
      const next = current + amountMinor;
      writeTxn(sql, "credit", amountMinor, reference, description, next);
      setBalance(sql, next);
      return next;
    }),
  debit: (amountMinor, reference, description) =>
    Effect.sync(() => {
      const current = Number(readMeta(sql, "balance") ?? "0");
      if (referenceExists(sql, reference)) {
        return current;
      }
      if (!canDebit(current, amountMinor)) {
        return null;
      }
      const next = current - amountMinor;
      writeTxn(sql, "debit", amountMinor, reference, description, next);
      setBalance(sql, next);
      return next;
    }),
});

const BalanceResponse = Schema.Struct({ balanceMinor: Schema.Number });

const balance = HttpApiEndpoint.get("balance", "/balance", {
  success: BalanceResponse,
});

const credit = HttpApiEndpoint.post("credit", "/credit", {
  payload: Schema.Struct({
    amountMinor: Schema.Number,
    reference: Schema.String,
    description: Schema.String,
  }),
  success: BalanceResponse,
});

const debit = HttpApiEndpoint.post("debit", "/debit", {
  payload: Schema.Struct({
    amountMinor: Schema.Number,
    reference: Schema.String,
    description: Schema.String,
  }),
  success: BalanceResponse,
});

class WalletGroup extends HttpApiGroup.make("Wallet")
  .add(balance)
  .add(credit)
  .add(debit) {}

class WalletApi extends HttpApi.make("WalletApi").add(WalletGroup) {}

const walletGroup = HttpApiBuilder.group(
  WalletApi,
  "Wallet",
  Effect.fn(function* (handlers) {
    const store = yield* WalletStore;
    return handlers
      .handle("balance", () =>
        Effect.gen(function* () {
          const value = yield* store.balance();
          return { balanceMinor: value };
        }),
      )
      .handle("credit", ({ payload }) =>
        Effect.gen(function* () {
          const value = yield* store.credit(
            payload.amountMinor,
            payload.reference,
            payload.description,
          );
          return { balanceMinor: value };
        }),
      )
      .handle("debit", ({ payload }) =>
        Effect.gen(function* () {
          const value = yield* store.debit(
            payload.amountMinor,
            payload.reference,
            payload.description,
          );
          return { balanceMinor: value ?? -1 };
        }),
      );
  }),
);

const makeLayer = (store: WalletStoreImpl) =>
  HttpApiBuilder.layer(WalletApi).pipe(
    Layer.provide(
      walletGroup.pipe(Layer.provide(Layer.succeed(WalletStore)(store))),
    ),
    Layer.provide(HttpServer.layerServices),
  );

export class WalletAgent {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS wallet_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS wallet_txns (id TEXT PRIMARY KEY, type TEXT NOT NULL, amount_minor INTEGER NOT NULL, reference TEXT NOT NULL UNIQUE, description TEXT NOT NULL, balance_after INTEGER NOT NULL, created_at TEXT NOT NULL)",
    );
  }

  async fetch(request: Request): Promise<Response> {
    const layer = makeLayer(makeStore(this.ctx.storage.sql));
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const handler = yield* HttpRouter.toHttpEffect(layer);
        return yield* handler.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(request),
          ),
        );
      }).pipe(Effect.scoped),
    );
    if (exit._tag === "Success") {
      return HttpServerResponse.toWeb(exit.value);
    }
    const [response] = await Effect.runPromise(
      HttpServerError.causeResponse(exit.cause),
    );
    return HttpServerResponse.toWeb(response);
  }
}
