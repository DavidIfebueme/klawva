import { aiDisclosureLine } from "./rules.ts";

export const TWIML_DEFAULT_SECONDS = 90;
export const TWIML_MIN_SECONDS = 30;
export const TWIML_MAX_SECONDS = 600;

export const clampRelaySeconds = (raw: string | null): number => {
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return TWIML_DEFAULT_SECONDS;
  }
  return Math.min(Math.max(parsed, TWIML_MIN_SECONDS), TWIML_MAX_SECONDS);
};

export const twimlForCall = (maxSeconds: number): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${aiDisclosureLine}</Say>
  <Say voice="alice">Hello, this is a Klawva employee on a test call. The line stays open for up to ${maxSeconds} seconds.</Say>
  <Pause length="${maxSeconds}"/>
  <Say voice="alice">That is the end of the test call. Goodbye.</Say>
  <Hangup/>
</Response>`;
