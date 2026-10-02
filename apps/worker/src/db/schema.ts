import * as Schema from "effect/Schema";

export const SessionState = Schema.Literals([
  "pending",
  "provisioning",
  "active",
  "hibernating",
  "recovering",
  "completed",
  "failed",
]);
export type SessionState = typeof SessionState.Type;

export const ListingStatus = Schema.Literals([
  "draft",
  "in_review",
  "published",
  "rejected",
  "unpublished",
]);
export type ListingStatus = typeof ListingStatus.Type;

export const Channel = Schema.Literals(["telegram"]);
export type Channel = typeof Channel.Type;

export const MessageRole = Schema.Literals(["user", "assistant", "tool", "system"]);
export type MessageRole = typeof MessageRole.Type;

export const Brief = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String));
export type Brief = typeof Brief.Type;

export const StringList = Schema.fromJsonString(Schema.Array(Schema.String));
export type StringList = typeof StringList.Type;

export const EventPayload = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown),
);
export type EventPayload = typeof EventPayload.Type;

export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  email: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

export class AgentListing extends Schema.Class<AgentListing>("AgentListing")({
  id: Schema.String,
  ownerId: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  status: ListingStatus,
  priceMinor: Schema.Number,
  currentVersion: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

export class ListingVersion extends Schema.Class<ListingVersion>("ListingVersion")({
  id: Schema.String,
  listingId: Schema.String,
  version: Schema.Number,
  manifestHash: Schema.String,
  soul: Schema.String,
  briefFields: StringList,
  toolAllowlist: StringList,
  model: Schema.String,
  score: Schema.NullOr(Schema.Number),
  reviewedBy: Schema.NullOr(Schema.String),
  reviewedAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
}) {}

export class Session extends Schema.Class<Session>("Session")({
  id: Schema.String,
  listingId: Schema.String,
  listingVersion: Schema.Number,
  agentId: Schema.String,
  channel: Channel,
  brief: Brief,
  state: SessionState,
  customerEmail: Schema.NullOr(Schema.String),
  windowStart: Schema.NullOr(Schema.String),
  windowEnd: Schema.NullOr(Schema.String),
  budgetMinor: Schema.Number,
  spentMinor: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

export class Message extends Schema.Class<Message>("Message")({
  id: Schema.String,
  sessionId: Schema.String,
  role: MessageRole,
  content: Schema.String,
  createdAt: Schema.String,
}) {}

export class ChannelLink extends Schema.Class<ChannelLink>("ChannelLink")({
  id: Schema.String,
  sessionId: Schema.String,
  channel: Channel,
  chatId: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

export class ActivityEvent extends Schema.Class<ActivityEvent>("ActivityEvent")({
  id: Schema.String,
  sessionId: Schema.String,
  type: Schema.String,
  payload: EventPayload,
  occurredAt: Schema.String,
}) {}
