import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { isBlockedHost, redirectStatuses, toText } from "../agent/tools.ts";

export interface BoxliteConfig {
  readonly apiKey: string;
  readonly restUrl: string;
}

export class BoxliteError extends Schema.TaggedError<BoxliteError>()(
  "BoxliteError",
  { reason: Schema.String },
) {}

export const boxImage = "docker.io/zenika/alpine-chrome:with-node";
export const boxIdleSeconds = 120;
export const boxDeleteSeconds = 7200;
export const boxPageLimit = 5;
export const boxWorkDir = "/home/chrome/work";
export const pagePathFor = (id: string): string => `${boxWorkDir}/page-${id}.html`;
export const maxRenderedChars = 600_000;

export const boxNameFor = (sessionId: string): string => `klawva-${sessionId}`;

export const boxliteConfigFrom = (env: {
  readonly BOXLITE_API_KEY?: string;
  readonly BOXLITE_REST_URL?: string;
}): BoxliteConfig | null =>
  env.BOXLITE_API_KEY === undefined || env.BOXLITE_REST_URL === undefined
    ? null
    : { apiKey: env.BOXLITE_API_KEY, restUrl: env.BOXLITE_REST_URL };

const BoxRecord = Schema.Struct({
  box_id: Schema.String,
  name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.String,
});

const BoxList = Schema.Struct({
  boxes: Schema.Array(BoxRecord),
  next_page_token: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const Execution = Schema.Struct({
  execution_id: Schema.String,
  status: Schema.optionalKey(Schema.String),
  exit_code: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});

type Execution = typeof Execution.Type;

const ended = (execution: Execution): boolean =>
  execution.status !== undefined &&
  execution.status !== "running" &&
  execution.status !== "pending";

const request = (
  config: BoxliteConfig,
  path: string,
  init: { method: string; body?: unknown },
): Effect.Effect<Response, BoxliteError> =>
  Effect.tryPromise({
    try: () =>
      fetch(`${config.restUrl}${path}`, {
        method: init.method,
        signal: AbortSignal.timeout(120_000),
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      }),
    catch: (cause) => new BoxliteError({ reason: `network ${String(cause)}` }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.succeed(response)
        : Effect.fail(new BoxliteError({ reason: `status ${response.status}` })),
    ),
  );

const shapeFailed = (): BoxliteError => new BoxliteError({ reason: "shape" });

const decodeList = (body: unknown): Effect.Effect<typeof BoxList.Type, BoxliteError> =>
  Effect.fromOption(Schema.decodeUnknownOption(BoxList)(body)).pipe(
    Effect.mapError(shapeFailed),
  );

const decodeRecord = (body: unknown): Effect.Effect<typeof BoxRecord.Type, BoxliteError> =>
  Effect.fromOption(Schema.decodeUnknownOption(BoxRecord)(body)).pipe(
    Effect.mapError(shapeFailed),
  );

const decodeExecution = (body: unknown): Effect.Effect<Execution, BoxliteError> =>
  Effect.fromOption(Schema.decodeUnknownOption(Execution)(body)).pipe(
    Effect.mapError(shapeFailed),
  );

const bodyOf = (response: Response): Effect.Effect<unknown, BoxliteError> =>
  Effect.tryPromise({
    try: async (): Promise<unknown> => await response.json(),
    catch: (cause) => new BoxliteError({ reason: `json ${String(cause)}` }),
  });

export const findBox = (
  config: BoxliteConfig,
  sessionId: string,
): Effect.Effect<string | null, BoxliteError> =>
  Effect.gen(function* () {
    const name = boxNameFor(sessionId);
    let token: string | null = null;
    for (let page = 0; page < boxPageLimit; page += 1) {
      const query: string =
        token === null ? "" : `?page_token=${encodeURIComponent(token)}`;
      const list: typeof BoxList.Type = yield* request(
        config,
        `/v1/boxes${query}`,
        {
          method: "GET",
        },
      ).pipe(Effect.flatMap(bodyOf), Effect.flatMap(decodeList));
      const match = list.boxes.find((box) => box.name === name);
      if (match !== undefined) {
        return match.box_id;
      }
      token = list.next_page_token ?? null;
      if (token === null) {
        return null;
      }
    }
    return null;
  });

export const createBox = (
  config: BoxliteConfig,
  sessionId: string,
): Effect.Effect<string, BoxliteError> =>
  request(config, "/v1/boxes", {
    method: "POST",
    body: {
      name: boxNameFor(sessionId),
      image: boxImage,
      cpus: 1,
      memory_mib: 2048,
      disk_size_gb: 10,
      auto_stop: boxIdleSeconds,
      auto_delete: boxDeleteSeconds,
      cmd: ["sh", "-c", "sleep infinity"],
    },
  }).pipe(
    Effect.flatMap(bodyOf),
    Effect.flatMap(decodeRecord),
    Effect.map((box) => box.box_id),
  );

export const ensureBox = (
  config: BoxliteConfig,
  sessionId: string,
): Effect.Effect<string, BoxliteError> =>
  findBox(config, sessionId).pipe(
    Effect.flatMap((existing) =>
      existing === null
        ? createBox(config, sessionId).pipe(
            Effect.catch((first: BoxliteError) =>
              findBox(config, sessionId).pipe(
                Effect.flatMap((raced) =>
                  raced === null ? Effect.fail(first) : Effect.succeed(raced),
                ),
              ),
            ),
          )
        : Effect.succeed(existing),
    ),
  );

export const startExecution = (
  config: BoxliteConfig,
  boxId: string,
  command: string,
  args: ReadonlyArray<string>,
): Effect.Effect<string, BoxliteError> =>
  request(config, `/v1/boxes/${boxId}/exec`, {
    method: "POST",
    body: { command, args: [...args] },
  }).pipe(
    Effect.flatMap(bodyOf),
    Effect.flatMap(decodeExecution),
    Effect.map((execution) => execution.execution_id),
  );

export const readExecution = (
  config: BoxliteConfig,
  boxId: string,
  executionId: string,
): Effect.Effect<Execution, BoxliteError> =>
  request(config, `/v1/boxes/${boxId}/executions/${executionId}`, {
    method: "GET",
  }).pipe(Effect.flatMap(bodyOf), Effect.flatMap(decodeExecution));

export const awaitExecution = (
  config: BoxliteConfig,
  boxId: string,
  executionId: string,
): Effect.Effect<Execution, BoxliteError> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const execution = yield* readExecution(config, boxId, executionId);
      if (ended(execution)) {
        return execution;
      }
      yield* Effect.sleep("1000 millis");
    }
    return yield* Effect.fail(new BoxliteError({ reason: "execution timeout" }));
  });

export const unwrapTransfer = (bytes: Uint8Array): string => {
  const decoder = new TextDecoder();
  if (bytes.length < 512) {
    return decoder.decode(bytes);
  }
  const sizeField = decoder
    .decode(bytes.slice(124, 136))
    .replace(/\0/g, "")
    .trim();
  const size = Number.parseInt(sizeField, 8);
  if (Number.isNaN(size) || size < 0 || 512 + size > bytes.length) {
    return decoder.decode(bytes);
  }
  return decoder.decode(bytes.slice(512, 512 + size));
};

export const readFile = (
  config: BoxliteConfig,
  boxId: string,
  path: string,
): Effect.Effect<string, BoxliteError> =>
  request(
    config,
    `/v1/boxes/${boxId}/files?path=${encodeURIComponent(path)}`,
    { method: "GET" },
  ).pipe(
    Effect.flatMap((response) =>
      Effect.promise(() => response.arrayBuffer()),
    ),
    Effect.map((buffer) => unwrapTransfer(new Uint8Array(buffer))),
  );

export const releaseSessionBox = (
  config: BoxliteConfig,
  sessionId: string,
): Effect.Effect<void> =>
  findBox(config, sessionId).pipe(
    Effect.flatMap((boxId) =>
      boxId === null ? Effect.void : removeBox(config, boxId),
    ),
    Effect.catch(() => Effect.void),
  );

export const removeBox = (
  config: BoxliteConfig,
  boxId: string,
): Effect.Effect<void, BoxliteError> =>
  request(config, `/v1/boxes/${boxId}?force=true`, { method: "DELETE" }).pipe(
    Effect.asVoid,
  );

export const touchBox = (
  config: BoxliteConfig,
  boxId: string,
): Effect.Effect<void, BoxliteError> =>
  startExecution(config, boxId, "true", []).pipe(
    Effect.flatMap((executionId) => awaitExecution(config, boxId, executionId)),
    Effect.asVoid,
  );

export const renderCommand = (
  url: string,
  path: string,
): ReadonlyArray<string> => {
  const encoded = btoa(url);
  return [
    "-c",
    `mkdir -p ${boxWorkDir} && u=$(printf %s '${encoded}' | base64 -d) && timeout 35 chromium-browser --headless --disable-gpu --no-sandbox --hide-scrollbars --virtual-time-budget=5000 --dump-dom "$u" > ${path} 2>/dev/null; exit $?`,
  ];
};

export const resolvePublicUrl = (
  start: URL,
): Effect.Effect<string | null, BoxliteError> =>
  Effect.gen(function* () {
    let current = start;
    for (let hop = 0; hop <= 3; hop += 1) {
      if (isBlockedHost(current.hostname)) {
        return null;
      }
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(current, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(8_000),
          }),
        catch: (cause) => new BoxliteError({ reason: `hop ${String(cause)}` }),
      });
      const location = redirectStatuses.has(response.status)
        ? response.headers.get("location")
        : null;
      yield* Effect.promise(
        () => response.body?.cancel() ?? Promise.resolve(),
      );
      if (location === null) {
        return current.toString();
      }
      const next = URL.parse(location, current.toString());
      if (next === null) {
        return null;
      }
      if (next.protocol !== "https:" && next.protocol !== "http:") {
        return null;
      }
      current = next;
    }
    return null;
  });

export const navigableUrl = (raw: string): string | null => {
  const parsed = URL.parse(raw);
  if (parsed === null) {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (isBlockedHost(parsed.hostname)) {
    return null;
  }
  return parsed.toString();
};

export const browseUrl = (
  config: BoxliteConfig,
  sessionId: string,
  rawUrl: string,
): Effect.Effect<string, BoxliteError> =>
  Effect.gen(function* () {
    const checked = navigableUrl(rawUrl);
    if (checked === null) {
      return "browse refused: url not allowed";
    }
    const target = yield* resolvePublicUrl(new URL(checked));
    if (target === null) {
      return "browse refused: url not allowed";
    }
    const boxId = yield* ensureBox(config, sessionId);
    const path = pagePathFor(crypto.randomUUID());
    const executionId = yield* startExecution(
      config,
      boxId,
      "sh",
      renderCommand(target, path),
    );
    const execution = yield* awaitExecution(config, boxId, executionId);
    const html = yield* readFile(config, boxId, path);
    const text = toText(html).slice(0, maxRenderedChars);
    if (text.length > 0) {
      return text;
    }
    if (execution.exit_code === 124 || execution.exit_code === 143) {
      return "browse failed: page took too long to render";
    }
    return execution.exit_code !== undefined && execution.exit_code !== 0
      ? `browse failed: render_exit_${execution.exit_code}`
      : "browse returned no text";
  });
