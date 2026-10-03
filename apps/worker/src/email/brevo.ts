import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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
}): Effect.Effect<void, EmailError> => {
  if (params.apiKey.length === 0 || params.senderEmail.length === 0) {
    return Effect.void;
  }
  return Effect.tryPromise({
    try: async () => {
      await fetch("https://api.brevo.com/v3/smtp/email", {
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
        }),
      });
    },
    catch: (cause) => new EmailError({ reason: String(cause) }),
  });
};

export const reportEmailHtml = (reportUrl: string): string =>
  `<div style="font-family:Inter,system-ui,sans-serif"><h2>Your Klawva worker shift has ended</h2><p><a href="${reportUrl}">View your mission report</a></p></div>`;
