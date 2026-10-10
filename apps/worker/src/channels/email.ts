import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import PostalMime from "postal-mime";
import { make as makeDatabase } from "../db/database.ts";
import { sendEmail } from "../email/brevo.ts";
import { renderTemplate } from "../email/templates.ts";
import { toEmailHtml } from "../lib/markdown.ts";
import type { Env } from "../env.ts";

export interface InboundEmail {
  readonly from: string;
  readonly to: string;
  readonly rawSize: number;
  readonly raw: ReadableStream;
  readonly setReject: (reason: string) => void;
}

const replyAddressValue = "employees@klawva.xyz";
const maxBytes = 1_000_000;

export const replyAddress = (): string => replyAddressValue;

export const isEmployeeRecipient = (to: string): boolean =>
  to.trim().toLowerCase() === replyAddressValue;

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
    if (!isEmployeeRecipient(message.to)) {
      message.setReject("Unknown recipient");
      return;
    }
    if (message.rawSize > maxBytes) {
      message.setReject("Message too large");
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
    const headerSender = parsed?.from?.address?.trim().toLowerCase() ?? "";
    const sender =
      headerSender.length > 0 ? headerSender : message.from.trim().toLowerCase();
    const db = makeDatabase(env.DB);
    const session = yield* db
      .first(
        "SELECT id AS id, state AS state FROM sessions WHERE customer_email = ? AND state IN ('pending', 'provisioning', 'active', 'hibernating', 'recovering') ORDER BY CASE state WHEN 'active' THEN 0 WHEN 'hibernating' THEN 1 WHEN 'recovering' THEN 2 WHEN 'provisioning' THEN 3 ELSE 4 END, created_at DESC LIMIT 1",
        [sender],
      )
      .pipe(Effect.orDie);
    if (session === null) {
      message.setReject("No active employee for this sender");
      return;
    }
    const sessionId = String(session.id);
    const sessionState = String(session.state);
    if (sessionState === "pending" || sessionState === "provisioning") {
      yield* sendEmail({
        apiKey: env.BREVO_API_KEY,
        senderEmail: env.BREVO_SENDER_EMAIL,
        senderName: "Klawva",
        toEmail: sender,
        subject: "Your Klawva employee is spinning up",
        html: renderTemplate({
          title: "Almost ready",
          body: "<p>Your employee is still getting set up. Reply to this thread in a few minutes and it will be with you.</p>",
        }),
      }).pipe(Effect.catch(() => Effect.void));
      return;
    }
    const plain = (parsed?.text ?? "").trim();
    const fromHtml = (parsed?.html ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const text = (plain.length > 0 ? plain : fromHtml).slice(0, 4000);
    if (text.length === 0) {
      return;
    }
    const reply = yield* askSession(env, sessionId, text);
    yield* sendEmail({
      apiKey: env.BREVO_API_KEY,
      senderEmail: env.BREVO_SENDER_EMAIL,
      senderName: "Klawva",
      toEmail: sender,
      subject: "Reply from your Klawva employee",
      html: renderTemplate({
        title: "Your employee replied",
        body: toEmailHtml(reply),
      }),
    }).pipe(Effect.catch(() => Effect.void));
  });
