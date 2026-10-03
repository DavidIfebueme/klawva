import * as Schema from "effect/Schema";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const failureFields = Schema.Struct({
  reason: Schema.optionalKey(Schema.String),
  _tag: Schema.optionalKey(Schema.String),
  detail: Schema.optionalKey(Schema.String),
});

export async function failureMessage(res: Response): Promise<string> {
  const payload: unknown = await res.json().catch(() => null);
  const decoded = Schema.decodeUnknownOption(failureFields)(payload);
  if (decoded._tag === "Some") {
    const reason = decoded.value.reason ?? decoded.value._tag ?? decoded.value.detail;
    if (reason !== undefined && reason.length > 0) {
      return reason;
    }
  }
  return `Request failed (${res.status})`;
}
