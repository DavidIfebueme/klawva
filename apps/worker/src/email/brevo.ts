import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { renderTemplate } from "./templates.ts";

export class EmailError extends Schema.TaggedError<EmailError>()("EmailError", {
  reason: Schema.String,
}) {}

export const sendEmail = (params: {
  readonly apiKey: string;
  readonly senderEmail: string;
  readonly senderName: string;
  readonly toEmail: string;
  readonly subject: string;
  readonly html: string;
  readonly replyToEmail?: string;
}): Effect.Effect<void, EmailError> => {
  if (params.apiKey.length === 0 || params.senderEmail.length === 0) {
    return Effect.void;
  }
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": params.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: params.senderName, email: params.senderEmail },
          to: [{ email: params.toEmail }],
          subject: params.subject,
          htmlContent: params.html,
          ...(params.replyToEmail !== undefined && params.replyToEmail.length > 0
            ? { replyTo: { email: params.replyToEmail } }
            : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`brevo_${response.status}`);
      }
    },
    catch: (cause) => new EmailError({ reason: String(cause) }),
  });
};

export const reportEmailHtml = (reportUrl: string): string =>
  renderTemplate({
    title: "Your Klawva worker shift has ended",
    body: "Your employee has finished its 24-hour shift. Your mission report is ready with everything it did, found, and delivered.",
    ctaLabel: "View your mission report",
    ctaHref: reportUrl,
  });
