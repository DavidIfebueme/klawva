export interface TemplateInput {
  readonly title: string;
  readonly body: string;
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
  readonly footer?: string;
}

const defaultFooter = "Thanks for hiring a Klawva employee.";

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const renderTemplate = ({
  title,
  body,
  ctaLabel,
  ctaHref,
  footer,
}: TemplateInput): string => {
  const cta =
    ctaLabel !== undefined && ctaHref !== undefined
      ? `<a href="${escapeHtml(ctaHref)}" style="display:inline-block;padding:12px 20px;background:#E8FF47;color:#0A0A0A;text-decoration:none;border-radius:8px;font-family:Inter,system-ui,sans-serif;font-weight:700;">${escapeHtml(ctaLabel)}</a>`
      : "";
  return (
    "<div style=\"background:#0A0A0A;padding:32px;font-family:Inter,system-ui,sans-serif;color:#EDEDED;\">" +
    "<div style=\"max-width:640px;margin:0 auto;background:#121212;border:1px solid #2A2A2A;border-radius:12px;padding:28px;\">" +
    "<div style=\"color:#E8FF47;font-weight:800;letter-spacing:0.16em;font-size:12px;margin-bottom:14px;\">KLAWVA</div>" +
    `<h1 style="font-size:24px;line-height:1.25;margin:0 0 12px 0;color:#FFFFFF;">${escapeHtml(title)}</h1>` +
    `<div style="font-size:14px;line-height:1.7;color:#BDBDBD;margin-bottom:20px;">${body}</div>` +
    cta +
    `<div style="margin-top:24px;font-size:12px;color:#6B6B6B;">${escapeHtml(footer ?? defaultFooter)}</div>` +
    "</div></div>"
  );
};

export type MagicLinkContext = "studio" | "account";

export const magicLinkEmail = (
  link: string,
  context: MagicLinkContext = "studio",
): string =>
  context === "account"
    ? renderTemplate({
        title: "Sign in to your Klawva account",
        body: "Click the button below to open your account. This link expires in 15 minutes. If you did not request it, ignore this email.",
        ctaLabel: "Open your account",
        ctaHref: link,
        footer: "View your shifts, reports, and spend.",
      })
    : renderTemplate({
        title: "Sign in to Klawva Studio",
        body: "Click the button below to open your studio. This link expires in 15 minutes. If you did not request it, ignore this email.",
        ctaLabel: "Open Klawva Studio",
        ctaHref: link,
        footer: "Publish listings, run sandbox evals, and track your employees.",
      });

export const listingApprovedEmail = (name: string): string =>
  renderTemplate({
    title: "Your employee is live",
    body: `Your listing <strong>${escapeHtml(name)}</strong> passed review and is now visible in the catalog. You can edit pricing and copy from the studio at any time.`,
    ctaLabel: "Open Studio",
    ctaHref: "https://www.klawva.xyz/studio",
  });

export const listingRejectedEmail = (name: string, reason: string): string =>
  renderTemplate({
    title: "Your listing needs changes",
    body: `Your listing <strong>${escapeHtml(name)}</strong> was not approved.<br/>Reason: <strong>${escapeHtml(reason)}</strong><br/>Update it in the studio and resubmit.`,
    ctaLabel: "Open Studio",
    ctaHref: "https://www.klawva.xyz/studio",
  });

export const shiftStartedEmail = (
  employeeName: string,
  startIso: string,
  endIso: string,
  openingReply?: string,
  isEmailChannel: boolean = false,
): string => {
  const start = new Date(startIso).toUTCString();
  const end = new Date(endIso).toUTCString();
  const opening =
    openingReply !== undefined && openingReply.trim().length > 0
      ? `<br/><br/><em>${escapeHtml(employeeName)}:</em><br/>${escapeHtml(openingReply)}<br/><br/>Reply to this email to redirect it.`
      : isEmailChannel
        ? `<br/><br/>Reply to this email to give it instructions.`
        : `<br/>Message the bot on Telegram to give instructions.`;
  return renderTemplate({
    title: "Your employee is now active",
    body: `<strong>${escapeHtml(employeeName)}</strong> is on shift.<br/>Start: <strong>${start}</strong><br/>End: <strong>${end}</strong>${opening}`,
    ctaLabel: "Open Klawva",
    ctaHref: "https://www.klawva.xyz/employees",
  });
};

export const welcomeEmail = (employeeName: string): string =>
  renderTemplate({
    title: "Welcome to Klawva",
    body: `Your first employee, <strong>${escapeHtml(employeeName)}</strong>, is ready to go. You will get a message when the shift starts, and the report when it ends. You can always open your account to see every employee you have hired.`,
    ctaLabel: "Open your account",
    ctaHref: "https://www.klawva.xyz/account",
  });

export const shiftEndingEmail = (
  employeeName: string,
  endIso: string,
): string =>
  renderTemplate({
    title: "Your shift is almost over",
    body: `<strong>${escapeHtml(employeeName)}</strong> finishes its 24-hour shift at <strong>${new Date(endIso).toUTCString()}</strong>. Send any last instructions now. The report follows when the shift ends.`,
    ctaLabel: "Open your account",
    ctaHref: "https://www.klawva.xyz/account",
  });
