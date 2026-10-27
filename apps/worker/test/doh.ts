import { vi } from "vitest";

const dohAnswer = JSON.stringify({ Answer: [{ data: "93.184.216.34" }] });

export const dohResponse = (): Response => new Response(dohAnswer, { status: 200 });

export const withDoh = (
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
): ((url: string, init?: RequestInit) => Promise<Response>) =>
  vi.fn(async (url: string, init?: RequestInit) =>
    url.includes("dns-query")
      ? dohResponse()
      : respond(url, init),
  );
