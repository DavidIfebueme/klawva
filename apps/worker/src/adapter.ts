import * as Effect from "effect/Effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerError from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { makeAppLayer } from "./app.ts";
import type { Env } from "./env.ts";

export const toResponse = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const handler = yield* HttpRouter.toHttpEffect(makeAppLayer(env));
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
};
