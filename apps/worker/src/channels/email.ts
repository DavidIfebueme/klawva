import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import PostalMime from "postal-mime";
import { make as makeDatabase } from "../db/database.ts";
import { sendEmail } from "../email/brevo.ts";
import { escapeHtml, renderTemplate } from "../email/templates.ts";
import type { Env } from "../env.ts";

export interface InboundEmail {
  readonly from: string;
  readonly to: string;
  readonly rawSize: number;
  readonly raw: ReadableStream;
  readonly setReject: (reason: string) => void;
}

const sessionPrefix = "employee-";
const maxBytes = 1_000_000;

export const sessionFromAddress = (to: string): string | null => {
  const local = to.split("@")[0] ?? "";
  if (!local.startsWith(sessionPrefix)) {
    return null;
  }
  const id = local.slice(sessionPrefix.length);
  return id.length > 0 ? id : null;
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
      Effect.succeed("The employee is unavailable right now. Please try again shortly."),
    ),
  );

export const handleInbound = (env: Env, message: InboundEmail): Effect.Effect<void> =>
  Effect.gen(function* () {
    const sessionId = sessionFromAddress(message.to);
    if (sessionId === null) {
      message.setReject("Unknown recipient");
      return;
    }
    if (message.rawSize > maxBytes) {
      message.setReject("Message too large");
      return;
    }
    const db = makeDatabase(env.DB);
    const session = yield* db
      .first("SELECT customer_email AS email FROM sessions WHERE id = ?", [sessionId])
      .pipe(Effect.orDie);
    if (session === null) {
      message.setReject("Unknown session");
      return;
    }
    const allowed = session.email === null ? "" : String(session.email).toLowerCase();
    if (allowed.length > 0 && message.from.toLowerCase() !== allowed) {
      message.setReject("Sender not allowed");
      return;
    }
    const raw = yield* Effect.tryPromise({
      try: () => new Response(message.raw).arrayBuffer(),
      catch: (cause) => new Error(String(cause)),
    }).pipe(Effect.catch(() => Effect.succeed(new ArrayBuffer(0))));
    const parsed = yield* Effect.tryPromise({
      try: () => PostalMime.parse(raw),
      catch: (cause) => new Error(String(cause)),
    }).pipe(Effect.catch(() => Effect.succeed(null)));
    const text = (parsed?.text ?? "").trim().slice(0, 4000);
    if (text.length === 0) {
      return;
    }
    const reply = yield* askSession(env, sessionId, text);
    yield* sendEmail({
      apiKey: env.BREVO_API_KEY,
      senderEmail: env.BREVO_SENDER_EMAIL,
      senderName: "Klawva",
      toEmail: message.from,
      subject: "Reply from your Klawva employee",
      html: renderTemplate({
        title: "Your employee replied",
        body: escapeHtml(reply).replace(/\n/g, "<br/>"),
      }),
    }).pipe(Effect.catch(() => Effect.void));
  });

export const replyAddress = (sessionId: string): string =>
  `${sessionPrefix}${sessionId}@mail.klawva.xyz`;
