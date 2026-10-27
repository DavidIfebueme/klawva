import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Carrier, CallHandle, DialParams } from "./carrier.ts";
import { CarrierError } from "./carrier.ts";
import { budgetCoversCall, maxSecondsForBudget } from "./ratecard.ts";
import { aiDisclosureLine, consentFor, insideCallingWindow, type Market } from "./rules.ts";
import {
  bindTransport,
  type IllegalTransportTransition,
} from "../session/transports.ts";

export class DialRefused extends Schema.TaggedError<DialRefused>()(
  "DialRefused",
  {
    reason: Schema.Literals([
      "no_consent",
      "on_dnc",
      "outside_calling_window",
      "budget_too_small",
    ]),
  },
) {}

export interface CheckedDialParams {
  readonly sessionId: string;
  readonly to: string;
  readonly market: Market;
  readonly agentName: string;
  readonly script: string;
  readonly budgetRemainingKobo: number;
  readonly at?: Date;
}

export const dialChecked = (
  db: DatabaseImpl,
  carrier: Carrier,
  params: CheckedDialParams,
): Effect.Effect<
  CallHandle & { maxSeconds: number },
  DialRefused | CarrierError | IllegalTransportTransition
> =>
  Effect.gen(function* () {
    const consent = yield* consentFor(db, params.to);
    if (consent.onDnc) {
      return yield* Effect.fail(new DialRefused({ reason: "on_dnc" }));
    }
    if (!consent.consented) {
      return yield* Effect.fail(new DialRefused({ reason: "no_consent" }));
    }
    if (!insideCallingWindow(params.market, params.at ?? new Date())) {
      return yield* Effect.fail(new DialRefused({ reason: "outside_calling_window" }));
    }
    if (!budgetCoversCall(params.budgetRemainingKobo, carrier.name)) {
      return yield* Effect.fail(new DialRefused({ reason: "budget_too_small" }));
    }
    const maxSeconds = maxSecondsForBudget(params.budgetRemainingKobo, carrier.name);
    const dialParams: DialParams = {
      to: params.to,
      market: params.market,
      agentName: params.agentName,
      script: params.script,
      welcomeMessage: `${aiDisclosureLine} ${params.script.split(".")[0]}.`,
      maxSeconds,
    };
    const handle = yield* carrier.dial(dialParams);
    // a dial that cannot bind its leg is a failed dial: the report layer needs the row
    yield* bindTransport(
      db,
      params.sessionId,
      "phone_out",
      carrier.name,
      handle.carrierRef,
    );
    return { ...handle, maxSeconds };
  });
