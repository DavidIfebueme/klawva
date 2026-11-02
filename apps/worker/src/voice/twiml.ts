export const TWIML_DEFAULT_SECONDS = 90;
export const TWIML_MIN_SECONDS = 30;
export const TWIML_MAX_SECONDS = 600;

export const clampRelaySeconds = (raw: string | null): number => {
  const trimmed = raw?.trim();
  if (trimmed === undefined || !/^\d+$/.test(trimmed)) {
    return TWIML_DEFAULT_SECONDS;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Math.min(Math.max(parsed, TWIML_MIN_SECONDS), TWIML_MAX_SECONDS);
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const twimlForCall = (
  _maxSeconds: number,
  name = "the business you are hearing from",
): string => {
  const business = escapeXml(name.slice(0, 80));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This call is from an AI employee. It is an automated message, not a conversation, and it is not recorded.</Say>
  <Say voice="alice">This is an automated message on behalf of ${business}. This line cannot hold a conversation yet. ${business} will follow up another way. Goodbye.</Say>
  <Hangup/>
</Response>`;
};
