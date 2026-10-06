import { sessionTokenMatches } from "../account/account.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";

const hexToBytes = (hex: string): Uint8Array => {
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)));
};

const ed25519 = { name: "Ed25519" };

export const verifyDiscordSignature = (
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): Effect.Effect<boolean> => {
  if (publicKeyHex.length === 0 || signatureHex.length === 0) {
    return Effect.succeed(false);
  }
  return Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey(
        "raw",
        hexToBytes(publicKeyHex),
        ed25519,
        false,
        ["verify"],
      );
      const message = new TextEncoder().encode(timestamp + rawBody);
      return await crypto.subtle.verify(ed25519, key, hexToBytes(signatureHex), message);
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(Effect.catch(() => Effect.succeed(false)));
};

const Interaction = Schema.Struct({
  type: Schema.Number,
  data: Schema.optionalKey(
    Schema.Struct({
      options: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            name: Schema.optionalKey(Schema.String),
            value: Schema.optionalKey(Schema.String),
          }),
        ),
      ),
    }),
  ),
});

const InteractionJson = Schema.fromJsonString(Interaction);

const decodeInteraction = (rawBody: string) =>
  Schema.decodeUnknownOption(InteractionJson)(rawBody);

const sessionReference = (
  raw: string,
): { readonly sessionId: string; readonly token: string | null } => {
  const slash = raw.lastIndexOf("/");
  if (slash <= 0) {
    return { sessionId: raw.trim(), token: null };
  }
  return {
    sessionId: raw.slice(0, slash).trim(),
    token: raw.slice(slash + 1).trim(),
  };
};

export const pongFor = (rawBody: string): string | null => {
  const decoded = decodeInteraction(rawBody);
  if (decoded._tag === "None") {
    return null;
  }
  return decoded.value.type === 1 ? JSON.stringify({ type: 1 }) : null;
};

const askSession = (
  env: Env,
  sessionId: string,
  content: string,
): Effect.Effect<string> =>
  Effect.tryPromise({
    try: async () => {
      const response = await env.SESSION.get(
        env.SESSION.idFromName(sessionId),
      ).fetch("https://session/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      });
      const body: unknown = await response.json();
      const decoded = Schema.decodeUnknownOption(
        Schema.Struct({ reply: Schema.optionalKey(Schema.String) }),
      )(body);
      return decoded._tag === "Some" ? decoded.value.reply ?? "" : "";
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(
    Effect.catch(() =>
      Effect.succeed("The employee is unavailable right now."),
    ),
  );

const reply = (content: string): string =>
  JSON.stringify({ type: 4, data: { content: content.slice(0, 2000) } });

export const handleDiscordInteraction = (
  env: Env,
  db: DatabaseImpl,
  rawBody: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const pong = pongFor(rawBody);
    if (pong !== null) {
      return pong;
    }
    const decoded = decodeInteraction(rawBody);
    if (decoded._tag === "None" || decoded.value.type !== 2) {
      return reply("Klawva received an unsupported interaction.");
    }
    const options = decoded.value.data?.options ?? [];
    const find = (name: string): string | null => {
      const found = options.find((option) => option.name === name);
      return found?.value ?? null;
    };
    const sessionRef = find("session");
    const message = find("message");
    if (sessionRef === null || message === null) {
      return reply("Use /ask with a session reference and a message.");
    }
    const { sessionId, token } = sessionReference(sessionRef);
    if (token === null || token.length === 0) {
      return reply(
        "Add your session token so I can check the shift is yours, like session:<id>/<token>. The link you were sent has both.",
      );
    }
    const owned = yield* sessionTokenMatches(db, sessionId, token).pipe(
      Effect.catch(() => Effect.succeed(false)),
    );
    if (!owned) {
      return reply("That token does not match this shift.");
    }
    const answer = yield* askSession(env, sessionId, message);
    return reply(answer);
  });
