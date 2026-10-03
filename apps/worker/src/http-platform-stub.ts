import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as HttpPlatform from "effect/http/HttpPlatform";

const compression: HttpPlatform.Compression = {
  algorithms: new Set(),
  compressResponse: (response) => Effect.succeed(response),
};

export const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression,
  fileResponse: () =>
    Effect.die("fileResponse is not supported on Workers"),
  fileWebResponse: () =>
    Effect.die("fileWebResponse is not supported on Workers"),
});

export const FileSystemStub = FileSystem.layerNoop({});
