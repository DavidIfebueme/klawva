import { linkChannel } from "../account/account.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class SlackError extends Schema.TaggedError<SlackError>()("SlackError", {
  reason: Schema.String,
}) {}
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";
import { constantTimeEqual } from "../lib/secure.ts";

const slackScopes = "app_mentions:read,chat:write,channels:read,groups:read";

export const authorizeUrl = (
  clientId: string,
  redirectUri: string,
  state: string,
): string =>
  `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(slackScopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

const hmacHex = (secret: string, message: string): Effect.Effect<string> =>
  Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(message),
      );
      return Array.from(new Uint8Array(signature))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(Effect.orDie);

export const verifySlackSignature = (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Effect.Effect<boolean> => {
  if (signingSecret.length === 0) {
    return Effect.succeed(false);
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    return Effect.succeed(false);
  }
  return hmacHex(signingSecret, `v0:${timestamp}:${rawBody}`).pipe(
    Effect.map((expected) => constantTimeEqual(`v0=${expected}`, signature)),
  );
};

const OauthResponse = Schema.Struct({
  ok: Schema.Boolean,
  access_token: Schema.optionalKey(Schema.String),
  team: Schema.optionalKey(
    Schema.Struct({
      id: Schema.optionalKey(Schema.String),
      name: Schema.optionalKey(Schema.String),
    }),
  ),
});

export interface SlackInstall {
  readonly accessToken: string;
  readonly teamId: string;
  readonly teamName: string;
}

export const exchangeCode = (
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Effect.Effect<SlackInstall | null> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const body: unknown = await response.json();
      const decoded = Schema.decodeUnknownOption(OauthResponse)(body);
      if (decoded._tag === "None" || !decoded.value.ok) {
        return null;
      }
      const token = decoded.value.access_token;
      const teamId = decoded.value.team?.id;
      if (token === undefined || teamId === undefined) {
        return null;
      }
      return {
        accessToken: token,
        teamId,
        teamName: decoded.value.team?.name ?? "Slack",
      };
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(Effect.catch(() => Effect.succeed(null)));

export const postMessage = (
  token: string,
  channel: string,
  text: string,
): Effect.Effect<void, SlackError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel, text: text.slice(0, 4000) }),
      });
      if (!response.ok) {
        throw new Error(`slack_${response.status}`);
      }
      const body: unknown = await response.json();
      const decoded = Schema.decodeUnknownOption(
        Schema.Struct({ ok: Schema.Boolean }),
      )(body);
      if (decoded._tag === "Some" && !decoded.value.ok) {
        throw new Error("slack_not_ok");
      }
    },
    catch: (cause) => new SlackError({ reason: String(cause) }),
  });

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
      Effect.succeed("The employee is unavailable right now. Please try again shortly."),
    ),
  );

export const saveConnection = (
  db: DatabaseImpl,
  userId: string,
  install: SlackInstall,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO connections (id, user_id, provider, external_id, access_token, scopes, created_at, updated_at) VALUES (?, ?, 'slack', ?, ?, ?, ?, ?) ON CONFLICT(provider, external_id) DO UPDATE SET access_token = excluded.access_token, user_id = excluded.user_id, updated_at = excluded.updated_at",
      [
        crypto.randomUUID(),
        userId,
        install.teamId,
        install.accessToken,
        slackScopes,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    )
    .pipe(Effect.orDie);

export const handleEvent = (
  env: Env,
  db: DatabaseImpl,
  body: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => {
        const value: unknown = JSON.parse(body);
        return Schema.decodeUnknownOption(
          Schema.Struct({
            type: Schema.optionalKey(Schema.String),
            challenge: Schema.optionalKey(Schema.String),
            team_id: Schema.optionalKey(Schema.String),
            event: Schema.optionalKey(
              Schema.Struct({
                type: Schema.optionalKey(Schema.String),
                channel: Schema.optionalKey(Schema.String),
                text: Schema.optionalKey(Schema.String),
              }),
            ),
          }),
        )(value);
      },
      catch: () => new Error("bad_json"),
    }).pipe(Effect.orDie);
    if (parsed._tag === "None") {
      return "ok";
    }
    if (parsed.value.type === "url_verification") {
      return parsed.value.challenge ?? "ok";
    }
    const teamId = parsed.value.team_id;
    const event = parsed.value.event;
    if (
      teamId === undefined ||
      event === undefined ||
      event.type !== "app_mention" ||
      event.channel === undefined
    ) {
      return "ok";
    }
    const connection = yield* db
      .first(
        "SELECT user_id AS userId, access_token AS token FROM connections WHERE provider = 'slack' AND external_id = ?",
        [teamId],
      )
      .pipe(Effect.orDie);
    if (connection === null) {
      return "ok";
    }
    const session = yield* db
      .first(
        "SELECT id AS id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [String(connection.userId)],
      )
      .pipe(Effect.orDie);
    if (session === null) {
      return "ok";
    }
    const sessionId = String(session.id);
    const chatId = `${teamId}:${event.channel}`;
    yield* linkChannel(db, sessionId, "slack", chatId);
    const text = (event.text ?? "").replace(/<@[^>]+>/g, "").trim();
    const reply = yield* askSession(env, sessionId, text.length > 0 ? text : "Hello");
    yield* postMessage(String(connection.token), event.channel, reply).pipe(
      Effect.catch(() => Effect.void),
    );
    return "ok";
  });
