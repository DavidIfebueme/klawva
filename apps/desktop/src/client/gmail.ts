export const googleClientId: string =
  typeof import.meta.env.VITE_GOOGLE_CLIENT_ID === "string" &&
  import.meta.env.VITE_GOOGLE_CLIENT_ID.length > 0
    ? import.meta.env.VITE_GOOGLE_CLIENT_ID
    : "klawva-google-client-id-unset";

export const gmailScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const newPkceVerifier = (): string => {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
};

export const pkceChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
};

export const newState = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
};

export const buildAuthUrl = (params: {
  readonly challenge: string;
  readonly state: string;
  readonly redirectUri: string;
}): string => {
  const query = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: gmailScopes.join(" "),
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    state: params.state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
};

export interface GoogleTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
}

const isTokenResponse = (
  value: unknown,
): value is { access_token: string; refresh_token?: string; expires_in: number } =>
  typeof value === "object" &&
  value !== null &&
  "access_token" in value &&
  typeof value.access_token === "string" &&
  "expires_in" in value &&
  typeof value.expires_in === "number";

const tokenRequest = async (body: URLSearchParams): Promise<GoogleTokens> => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`token request failed with ${response.status}`);
  }
  const parsed: unknown = await response.json();
  if (!isTokenResponse(parsed)) {
    throw new Error("token response had an unexpected shape");
  }
  return {
    accessToken: parsed.access_token,
    refreshToken: typeof parsed.refresh_token === "string" ? parsed.refresh_token : null,
    expiresAt: Date.now() + parsed.expires_in * 1000,
  };
};

export const exchangeCode = (
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<GoogleTokens> =>
  tokenRequest(
    new URLSearchParams({
      client_id: googleClientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  );

export const refreshAccessToken = (refreshToken: string): Promise<GoogleTokens> =>
  tokenRequest(
    new URLSearchParams({
      client_id: googleClientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );

const gmailFetch = async (
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> => {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`gmail ${path} failed with ${response.status}`);
  }
  return response.json();
};

export interface UnreadMessage {
  readonly id: string;
  readonly threadId: string;
}

const isUnreadList = (
  value: unknown,
): value is { messages?: Array<{ id: string; threadId: string }> } =>
  typeof value === "object" &&
  value !== null &&
  (!("messages" in value) ||
    (Array.isArray(value.messages) &&
      value.messages.every(
        (message: unknown) =>
          typeof message === "object" &&
          message !== null &&
          "id" in message &&
          typeof message.id === "string" &&
          "threadId" in message &&
          typeof message.threadId === "string",
      )));

export const listUnread = async (
  accessToken: string,
  maxResults = 25,
): Promise<ReadonlyArray<UnreadMessage>> => {
  const data = await gmailFetch(
    accessToken,
    `/messages?q=${encodeURIComponent("is:unread in:inbox")}&maxResults=${maxResults}`,
  );
  if (!isUnreadList(data)) {
    throw new Error("unread list had an unexpected shape");
  }
  return (data.messages ?? []).map((message) => ({
    id: message.id,
    threadId: message.threadId,
  }));
};

export interface ThreadMessage {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly date: string;
  readonly body: string;
}

const headerValue = (
  headers: ReadonlyArray<{ name: string; value: string }>,
  name: string,
): string => headers.find((header) => header.name.toLowerCase() === name)?.value ?? "";

const decodeBody = (data: string): string => {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(normalized);
  } catch {
    return "";
  }
};

interface ThreadPayloadMessage {
  readonly id: string;
  readonly payload?: {
    readonly headers?: ReadonlyArray<{ name: string; value: string }>;
    readonly body?: { readonly data?: string };
    readonly parts?: ReadonlyArray<{
      readonly mimeType: string;
      readonly body?: { readonly data?: string };
    }>;
  };
}

const isThreadShape = (
  value: unknown,
): value is { messages?: Array<ThreadPayloadMessage> } =>
  typeof value === "object" &&
  value !== null &&
  (!("messages" in value) || Array.isArray(value.messages));

export const getThread = async (
  accessToken: string,
  threadId: string,
): Promise<ReadonlyArray<ThreadMessage>> => {
  const data = await gmailFetch(accessToken, `/threads/${threadId}?format=full`);
  if (!isThreadShape(data)) {
    throw new Error("thread had an unexpected shape");
  }
  return (data.messages ?? []).map((message) => {
    const payload = message.payload;
    const headers = payload?.headers ?? [];
    const plainPart = payload?.parts?.find((part) => part.mimeType === "text/plain");
    const raw = plainPart?.body?.data ?? payload?.body?.data ?? "";
    return {
      id: message.id,
      from: headerValue(headers, "from"),
      subject: headerValue(headers, "subject"),
      date: headerValue(headers, "date"),
      body: decodeBody(raw).slice(0, 8000),
    };
  });
};

export const buildDraftRaw = (params: {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly inReplyTo?: string;
  readonly references?: string;
}): string => {
  const lines = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (params.inReplyTo !== undefined && params.inReplyTo.length > 0) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`);
  }
  if (params.references !== undefined && params.references.length > 0) {
    lines.push(`References: ${params.references}`);
  }
  const message = `${lines.join("\r\n")}\r\n\r\n${params.body}`;
  return btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const createDraft = async (
  accessToken: string,
  params: {
    readonly to: string;
    readonly subject: string;
    readonly body: string;
    readonly threadId?: string;
    readonly inReplyTo?: string;
    readonly references?: string;
  },
): Promise<string> => {
  const data = await gmailFetch(accessToken, "/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw: buildDraftRaw(params),
        ...(params.threadId !== undefined ? { threadId: params.threadId } : {}),
      },
    }),
  });
  if (typeof data !== "object" || data === null || !("id" in data) || typeof data.id !== "string") {
    throw new Error("draft response had an unexpected shape");
  }
  return data.id;
};
