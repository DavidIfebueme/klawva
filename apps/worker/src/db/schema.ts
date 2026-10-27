import * as Schema from "effect/Schema";

export const SessionState = Schema.Literals([
  "pending",
  "active",
  "hibernating",
  "recovering",
  "completed",
  "failed",
  "expired",
]);
export type SessionState = typeof SessionState.Type;

export const sessionTransitions: Record<
  SessionState,
  ReadonlyArray<SessionState>
> = {
  pending: ["active", "expired", "failed"],
  active: ["hibernating", "recovering", "completed", "failed"],
  hibernating: ["active", "recovering", "completed", "failed"],
  recovering: ["active", "completed", "failed"],
  completed: [],
  failed: [],
  expired: [],
};

export const liveSessionStates: ReadonlyArray<SessionState> = [
  "active",
  "hibernating",
  "recovering",
];

export const terminalSessionStates: ReadonlyArray<SessionState> = [
  "completed",
  "failed",
  "expired",
];

export const ListingStatus = Schema.Literals([
  "draft",
  "in_review",
  "published",
  "rejected",
  "unpublished",
]);
export type ListingStatus = typeof ListingStatus.Type;

export const Channel = Schema.Literals(["telegram", "web", "email"]);
export type Channel = typeof Channel.Type;

export const LinkChannel = Schema.Literals([
  "telegram",
  "web",
  "email",
  "slack",
  "discord",
]);
export type LinkChannel = typeof LinkChannel.Type;

export const MessageRole = Schema.Literals(["user", "assistant", "tool", "system"]);
export type MessageRole = typeof MessageRole.Type;

export const BriefRecord = Schema.Record(Schema.String, Schema.String);
export type BriefRecord = typeof BriefRecord.Type;

export const Brief = Schema.fromJsonString(BriefRecord);
export type Brief = typeof Brief.Type;

export const VoiceManifest = Schema.Struct({
  listen: Schema.Boolean,
  speak: Schema.Boolean,
  voiceId: Schema.optional(Schema.String),
});
export type VoiceManifest = typeof VoiceManifest.Type;

export const PhoneManifest = Schema.Struct({
  outbound: Schema.Boolean,
  inbound: Schema.Boolean,
  script: Schema.String,
});
export type PhoneManifest = typeof PhoneManifest.Type;

export const DesktopManifest = Schema.Struct({
  ownDevice: Schema.Boolean,
});
export type DesktopManifest = typeof DesktopManifest.Type;
export const LaunchMarket = Schema.Literals(["us", "in", "ng"]);
export type LaunchMarket = typeof LaunchMarket.Type;

export const accountMarketOrNull = Schema.NullOr(LaunchMarket);

export const RuntimeKind = Schema.Literals(["authored", "hosted", "desktop"]);
export type RuntimeKind = typeof RuntimeKind.Type;

export const BillingMode = Schema.Literals(["platform-metered", "author-metered"]);
export type BillingMode = typeof BillingMode.Type;

export const RuntimeTransport = Schema.Literals([
  "web",
  "email",
  "telegram",
  "phone",
  "desktop",
]);
export type RuntimeTransport = typeof RuntimeTransport.Type;

export const HostedRuntime = Schema.Struct({
  mode: Schema.Literals(["push", "pull"]),
  cardUrl: Schema.String,
  auth: Schema.optional(
    Schema.Struct({ type: Schema.String, header: Schema.String }),
  ),
});
export type HostedRuntime = typeof HostedRuntime.Type;

export const DesktopCapabilities = Schema.Struct({
  screen: Schema.optional(Schema.Literals(["read"])),
  input: Schema.optional(Schema.Array(Schema.String)),
  network: Schema.optional(Schema.Array(Schema.String)),
  fs: Schema.optional(Schema.Array(Schema.String)),
});
export type DesktopCapabilities = typeof DesktopCapabilities.Type;

export const DesktopRuntime = Schema.Struct({
  bundleId: Schema.String,
  entrypoint: Schema.String,
  dataDirs: Schema.Array(Schema.String),
  platforms: Schema.Array(Schema.Literals(["windows", "linux", "mac"])),
  network: Schema.optional(Schema.Array(Schema.String)),
  capabilities: DesktopCapabilities,
});
export type DesktopRuntime = typeof DesktopRuntime.Type;

export const RuntimeManifest = Schema.Struct({
  kind: RuntimeKind,
  billing: BillingMode,
  transport: Schema.Array(RuntimeTransport),
  hosted: Schema.optional(HostedRuntime),
  desktop: Schema.optional(DesktopRuntime),
});
export type RuntimeManifest = typeof RuntimeManifest.Type;

export const LimitsManifest = Schema.Struct({
  maxWallClockSeconds: Schema.Number,
  maxEvents: Schema.Number,
  maxEventBytes: Schema.Number,
  maxArtifactBytes: Schema.Number,
  minIdleSeconds: Schema.Number,
});
export type LimitsManifest = typeof LimitsManifest.Type;

export const ReportPolicy = Schema.Struct({
  requireEvidence: Schema.Boolean,
  minEvidence: Schema.Number,
});
export type ReportPolicy = typeof ReportPolicy.Type;

export const DataPolicy = Schema.Struct({
  retentionDays: Schema.Number,
  leavesCountry: Schema.Boolean,
  dpia: Schema.Boolean,
});
export type DataPolicy = typeof DataPolicy.Type;

export const Manifest = Schema.Struct({
  schema: Schema.optional(Schema.Number),
  soul: Schema.String,
  voice: Schema.optional(VoiceManifest),
  phone: Schema.optional(PhoneManifest),
  desktop: Schema.optional(DesktopManifest),
  launchMarkets: Schema.optional(Schema.Array(LaunchMarket)),
  runtime: Schema.optional(RuntimeManifest),
  limits: Schema.optional(LimitsManifest),
  report: Schema.optional(ReportPolicy),
  data: Schema.optional(DataPolicy),
});
export type Manifest = typeof Manifest.Type;

export const ManifestJson = Schema.fromJsonString(Manifest);
export type ManifestJson = typeof ManifestJson.Type;

export const manifestForSoul = (soul: string): Manifest => ({ soul });

export const StringList = Schema.fromJsonString(Schema.Array(Schema.String));
export type StringList = typeof StringList.Type;

export const EventPayload = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown),
);
export type EventPayload = typeof EventPayload.Type;

export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  email: Schema.String,
  market: Schema.NullOr(LaunchMarket),
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
  manifest: Schema.NullOr(ManifestJson),
  briefFields: StringList,
  toolAllowlist: StringList,
  model: Schema.String,
  score: Schema.NullOr(Schema.Number),
  reviewedBy: Schema.NullOr(Schema.String),
  reviewedAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
}) {}

export const manifestOf = (version: {
  readonly soul: string;
  readonly manifest: string | null;
}): Manifest => {
  if (version.manifest === null) {
    return manifestForSoul(version.soul);
  }
  return Schema.decodeUnknownSync(ManifestJson)(version.manifest);
};

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
  channel: LinkChannel,
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

export const TransportType = Schema.Literals(["desktop", "phone_in", "phone_out"]);
export type TransportType = typeof TransportType.Type;

export const TransportState = Schema.Literals(["pending", "bound", "active", "closed"]);
export type TransportState = typeof TransportState.Type;

export const transportTransitions: Record<
  TransportState,
  ReadonlyArray<TransportState>
> = {
  pending: ["bound", "closed"],
  bound: ["active", "closed"],
  active: ["closed"],
  closed: [],
};

export class SessionTransport extends Schema.Class<SessionTransport>("SessionTransport")({
  id: Schema.String,
  sessionId: Schema.String,
  type: TransportType,
  state: TransportState,
  carrier: Schema.NullOr(Schema.String),
  carrierRef: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}
