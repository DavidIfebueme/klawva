import * as Effect from "effect/Effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerError from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { appLayer } from "./app.ts";

const program = (request: Request) =>
  Effect.gen(function* () {
    const handler = yield* HttpRouter.toHttpEffect(appLayer);
    return yield* handler.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(request),
      ),
    );
  }).pipe(Effect.scoped);

export const toResponse = async (request: Request): Promise<Response> => {
  const exit = await Effect.runPromiseExit(program(request));
  if (exit._tag === "Success") {
    return HttpServerResponse.toWeb(exit.value);
  }
  const [response] = await Effect.runPromise(
    HttpServerError.causeResponse(exit.cause),
  );
  return HttpServerResponse.toWeb(response);
};
