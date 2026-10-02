import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";
import * as Etag from "effect/http/Etag";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import { FileSystemStub, HttpPlatformStub } from "./http-platform-stub.ts";

const HealthResponse = Schema.Struct({
  ok: Schema.Boolean,
  service: Schema.String,
});

const health = HttpApiEndpoint.get("health", "/health", {
  success: HealthResponse,
});

class RootGroup extends HttpApiGroup.make("Root").add(health) {}

class KlawvaApi extends HttpApi.make("Klawva").add(RootGroup) {}

const rootGroup = HttpApiBuilder.group(KlawvaApi, "Root", (handlers) =>
  handlers.handle("health", () => Effect.succeed({ ok: true, service: "klawva" })),
);

export const appLayer = HttpApiBuilder.layer(KlawvaApi).pipe(
  Layer.provide(rootGroup),
  Layer.provide([Etag.layer, HttpPlatformStub, FileSystemStub, Path.layer]),
);
