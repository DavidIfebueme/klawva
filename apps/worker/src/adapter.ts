import * as Effect from "effect/Effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerError from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { makeAppLayer } from "./app.ts";
import type { Env } from "./env.ts";

const securityHeaders = (headers: Headers): Headers => {
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  return headers;
};

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
    const response = HttpServerResponse.toWeb(exit.value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: securityHeaders(new Headers(response.headers)),
    });
  }
  const [response] = await Effect.runPromise(
    HttpServerError.causeResponse(exit.cause),
  );
  const web = HttpServerResponse.toWeb(response);
  return new Response(web.body, {
    status: web.status,
    statusText: web.statusText,
    headers: securityHeaders(new Headers(web.headers)),
  });
};

