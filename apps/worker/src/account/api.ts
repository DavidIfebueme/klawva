import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { identityFromToken, tokenFromHeaders } from "../auth/auth.ts";
import { AuthError } from "../auth/tokens.ts";
import { Database } from "../db/database.ts";
import { WorkerEnv } from "../env.ts";
import { ListingNotFound } from "../errors.ts";
import { accountSessionDetail, listAccountSessions } from "./account.ts";

const SessionSummary = Schema.Struct({
  id: Schema.String,
  state: Schema.String,
  channel: Schema.String,
  windowStart: Schema.NullOr(Schema.String),
  windowEnd: Schema.NullOr(Schema.String),
  budgetMinor: Schema.Number,
  spentMinor: Schema.Number,
  createdAt: Schema.String,
  listingName: Schema.NullOr(Schema.String),
  slug: Schema.NullOr(Schema.String),
});

const SessionDetail = Schema.Struct({
  id: Schema.String,
  state: Schema.String,
  channel: Schema.String,
  brief: Schema.String,
  windowStart: Schema.NullOr(Schema.String),
  windowEnd: Schema.NullOr(Schema.String),
  budgetMinor: Schema.Number,
  spentMinor: Schema.Number,
  createdAt: Schema.String,
  listingName: Schema.NullOr(Schema.String),
  slug: Schema.NullOr(Schema.String),
});

const TranscriptEntry = Schema.Struct({
  role: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
});

const ReportSummary = Schema.Struct({
  summary: Schema.String,
  shareToken: Schema.String,
  deliveredAt: Schema.NullOr(Schema.String),
});

const SessionDetailResponse = Schema.Struct({
  session: SessionDetail,
  transcript: Schema.Array(TranscriptEntry),
  report: Schema.NullOr(ReportSummary),
});

const IdParam = Schema.Struct({ id: Schema.String });

const accountSessions = HttpApiEndpoint.get(
  "accountSessions",
  "/api/account/sessions",
  { success: Schema.Array(SessionSummary), error: AuthError },
);

const accountSession = HttpApiEndpoint.get(
  "accountSession",
  "/api/account/sessions/:id",
  {
    params: IdParam,
    success: SessionDetailResponse,
    error: Schema.Union([AuthError, ListingNotFound]),
  },
);

class AccountGroup extends HttpApiGroup.make("Account")
  .add(accountSessions)
  .add(accountSession) {}

export class AccountApi extends HttpApi.make("AccountApi").add(AccountGroup) {}

export const accountGroup = HttpApiBuilder.group(
  AccountApi,
  "Account",
  Effect.fn(function* (handlers) {
    const db = yield* Database;
    const env = yield* WorkerEnv;

    const requireIdentity = () =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = tokenFromHeaders(request.headers);
        if (token === null) {
          return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
        }
        return yield* identityFromToken(env, db, token);
      });

    return handlers
      .handle("accountSessions", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const rows = yield* listAccountSessions(db, identity.userId, identity.email);
          return rows.map((row) => Schema.decodeUnknownSync(SessionSummary)(row));
        }),
      )
      .handle("accountSession", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const detail = yield* accountSessionDetail(
            db,
            identity.userId,
            identity.email,
            params.id,
          );
          if (detail === null) {
            return yield* Effect.fail(new ListingNotFound({}));
          }
          return {
            session: Schema.decodeUnknownSync(SessionDetail)(detail.session),
            transcript: detail.transcript.map((entry) =>
              Schema.decodeUnknownSync(TranscriptEntry)(entry),
            ),
            report:
              detail.report === null
                ? null
                : Schema.decodeUnknownSync(ReportSummary)(detail.report),
          };
        }),
      );
  }),
);
