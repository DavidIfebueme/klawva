import * as Schema from "effect/Schema";

export class ListingNotFound extends Schema.TaggedError<ListingNotFound>()(
  "ListingNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class ListingConflict extends Schema.TaggedError<ListingConflict>()(
  "ListingConflict",
  { reason: Schema.String },
  { httpApiStatus: 409 },
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  {},
  { httpApiStatus: 403 },
) {}
