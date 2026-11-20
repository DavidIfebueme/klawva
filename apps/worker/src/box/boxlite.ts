import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { isBlockedHost, toText } from "../agent/tools.ts";

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
export const boxWorkDir = "/home/chrome/work";
export const boxOutputPath = `${boxWorkDir}/page.html`;
export const boxExitPath = `${boxWorkDir}/exit.txt`;
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

const BoxList = Schema.Struct({ boxes: Schema.Array(BoxRecord) });

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
    try: () => response.json() as Promise<unknown>,
    catch: (cause) => new BoxliteError({ reason: `json ${String(cause)}` }),
  });

export const findBox = (
  config: BoxliteConfig,
  sessionId: string,
): Effect.Effect<string | null, BoxliteError> =>
  request(config, "/v1/boxes", { method: "GET" }).pipe(
    Effect.flatMap(bodyOf),
    Effect.flatMap(decodeList),
    Effect.map((list) => {
      const name = boxNameFor(sessionId);
      const match = list.boxes.find((box) => box.name === name);
      return match === undefined ? null : match.box_id;
    }),
  );

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
      auto_delete: 0,
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
      existing === null ? createBox(config, sessionId) : Effect.succeed(existing),
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
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const execution = yield* readExecution(config, boxId, executionId);
      if (ended(execution)) {
        return execution;
      }
      yield* Effect.sleep("300 millis");
    }
    return yield* Effect.fail(new BoxliteError({ reason: "execution timeout" }));
  });

export const readFile = (
  config: BoxliteConfig,
  boxId: string,
  path: string,
): Effect.Effect<string, BoxliteError> =>
  request(
    config,
    `/v1/boxes/${boxId}/files?path=${encodeURIComponent(path)}`,
    { method: "GET" },
  ).pipe(Effect.flatMap((response) => Effect.promise(() => response.text())));

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

export const renderCommand = (url: string): ReadonlyArray<string> => {
  const encoded = btoa(url);
  return [
    "-c",
    `mkdir -p ${boxWorkDir} && u=$(printf %s '${encoded}' | base64 -d) && chromium-browser --headless --disable-gpu --no-sandbox --hide-scrollbars --virtual-time-budget=5000 --dump-dom "$u" > ${boxOutputPath} 2>/dev/null; echo $? > ${boxExitPath}`,
  ];
};

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
    const target = navigableUrl(rawUrl);
    if (target === null) {
      return "browse refused: url not allowed";
    }
    const boxId = yield* ensureBox(config, sessionId);
    const executionId = yield* startExecution(
      config,
      boxId,
      "sh",
      renderCommand(target),
    );
    const execution = yield* awaitExecution(config, boxId, executionId);
    if (execution.exit_code !== undefined && execution.exit_code !== 0) {
      return `browse failed: shell_exit_${execution.exit_code}`;
    }
    const html = yield* readFile(config, boxId, boxOutputPath);
    const text = toText(html).slice(0, maxRenderedChars);
    return text.length === 0 ? "browse returned no text" : text;
  });
