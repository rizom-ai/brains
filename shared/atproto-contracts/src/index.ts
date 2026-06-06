import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import cardLexiconJson from "./lexicons/ai.rizom.brain.card.json";
import deckLexiconJson from "./lexicons/ai.rizom.brain.deck.json";
import linkLexiconJson from "./lexicons/ai.rizom.brain.link.json";
import noteLexiconJson from "./lexicons/ai.rizom.brain.note.json";
import postLexiconJson from "./lexicons/ai.rizom.brain.post.json";
import projectLexiconJson from "./lexicons/ai.rizom.brain.project.json";
import seriesLexiconJson from "./lexicons/ai.rizom.brain.series.json";
import socialPostLexiconJson from "./lexicons/ai.rizom.brain.socialPost.json";
import topicLexiconJson from "./lexicons/ai.rizom.brain.topic.json";

export interface AtprotoLexiconProperty {
  type: string;
  [key: string]: unknown;
}

export interface AtprotoLexiconRecordDef {
  type: "record";
  key: string;
  record: {
    type: "object";
    required?: string[] | undefined;
    properties: Record<string, AtprotoLexiconProperty>;
  };
}

export interface AtprotoLexicon {
  lexicon: 1;
  id: string;
  defs: {
    main: AtprotoLexiconRecordDef;
  };
}

const atprotoLexiconPropertySchema = z
  .object({ type: z.string() })
  .catchall(z.unknown());

const atprotoLexiconSchema = z.object({
  lexicon: z.literal(1),
  id: z.string(),
  defs: z.object({
    main: z.object({
      type: z.literal("record"),
      key: z.string().min(1),
      record: z.object({
        type: z.literal("object"),
        required: z.array(z.string()).optional(),
        properties: z.record(atprotoLexiconPropertySchema),
      }),
    }),
  }),
});

export function parseAtprotoLexicon(input: unknown): AtprotoLexicon {
  return atprotoLexiconSchema.parse(input);
}

export const canonicalAtprotoLexicons = {
  "ai.rizom.brain.card": parseAtprotoLexicon(cardLexiconJson),
  "ai.rizom.brain.deck": parseAtprotoLexicon(deckLexiconJson),
  "ai.rizom.brain.link": parseAtprotoLexicon(linkLexiconJson),
  "ai.rizom.brain.note": parseAtprotoLexicon(noteLexiconJson),
  "ai.rizom.brain.post": parseAtprotoLexicon(postLexiconJson),
  "ai.rizom.brain.project": parseAtprotoLexicon(projectLexiconJson),
  "ai.rizom.brain.series": parseAtprotoLexicon(seriesLexiconJson),
  "ai.rizom.brain.socialPost": parseAtprotoLexicon(socialPostLexiconJson),
  "ai.rizom.brain.topic": parseAtprotoLexicon(topicLexiconJson),
} as const satisfies Record<string, AtprotoLexicon>;

export type CanonicalAtprotoLexiconId = keyof typeof canonicalAtprotoLexicons;

export type AtprotoLexiconStatus = "draft" | "approved" | "deprecated";

export interface AtprotoLexiconMetadata {
  id: CanonicalAtprotoLexiconId;
  status: AtprotoLexiconStatus;
  version: string;
  revision: number;
  owner: string;
  steward: string;
  projectionPackage: string;
  compatibility: string;
  replacedBy?: CanonicalAtprotoLexiconId | undefined;
  deprecatedBy?: CanonicalAtprotoLexiconId | undefined;
}

const approvedCompatibilityPolicy =
  "Additive optional fields are compatible; required-field, type, or constraint changes require a migration plan or new NSID.";

function approvedLexiconMetadata(
  projectionPackage: string,
): Omit<AtprotoLexiconMetadata, "id"> {
  return {
    status: "approved",
    version: "1.0.0",
    revision: 1,
    owner: "Rizom",
    steward: "Rizom protocol registry",
    projectionPackage,
    compatibility: approvedCompatibilityPolicy,
  };
}

export const canonicalAtprotoLexiconMetadata = {
  "ai.rizom.brain.card": approvedLexiconMetadata("@brains/atproto"),
  "ai.rizom.brain.deck": approvedLexiconMetadata("@brains/decks"),
  "ai.rizom.brain.link": approvedLexiconMetadata("@brains/link"),
  "ai.rizom.brain.note": approvedLexiconMetadata("@brains/note"),
  "ai.rizom.brain.post": approvedLexiconMetadata("@brains/blog"),
  "ai.rizom.brain.project": approvedLexiconMetadata("@brains/portfolio"),
  "ai.rizom.brain.series": approvedLexiconMetadata("@brains/series"),
  "ai.rizom.brain.socialPost": approvedLexiconMetadata("@brains/social-media"),
  "ai.rizom.brain.topic": approvedLexiconMetadata("@brains/topics"),
} satisfies Record<
  CanonicalAtprotoLexiconId,
  Omit<AtprotoLexiconMetadata, "id">
>;

export function listCanonicalAtprotoLexicons(): AtprotoLexicon[] {
  return Object.values(canonicalAtprotoLexicons);
}

export function getCanonicalAtprotoLexicon(
  id: string,
): AtprotoLexicon | undefined {
  return canonicalAtprotoLexicons[id as CanonicalAtprotoLexiconId];
}

export function getCanonicalAtprotoLexiconMetadata(
  id: string,
): AtprotoLexiconMetadata | undefined {
  if (!(id in canonicalAtprotoLexiconMetadata)) return undefined;
  const canonicalId = id as CanonicalAtprotoLexiconId;
  return {
    id: canonicalId,
    ...canonicalAtprotoLexiconMetadata[canonicalId],
  };
}

export function listCanonicalAtprotoLexiconMetadata(): AtprotoLexiconMetadata[] {
  return Object.entries(canonicalAtprotoLexiconMetadata).map(
    ([id, metadata]) => ({
      id: id as CanonicalAtprotoLexiconId,
      ...metadata,
    }),
  );
}

interface AtprotoSchemaProperty extends AtprotoLexiconProperty {
  required?: string[] | undefined;
  properties?: Record<string, AtprotoSchemaProperty> | undefined;
  items?: AtprotoSchemaProperty | undefined;
  knownValues?: string[] | undefined;
  maxLength?: number | undefined;
  format?: string | undefined;
}

export type AtprotoRecordSchema = z.ZodType<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// RFC 3339 date-time with required offset (Z or ±hh:mm), matching the AT
// Protocol `datetime` string format. Lenient Date.parse would accept "2026-01-01".
const RFC3339_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function buildAtprotoStringSchema(
  property: AtprotoSchemaProperty,
): z.ZodType<string> {
  const baseSchema = z.string();
  let schema: z.ZodType<string> =
    property.maxLength !== undefined
      ? baseSchema.max(property.maxLength)
      : baseSchema;
  if (property.knownValues) {
    schema = schema.refine((value) => property.knownValues?.includes(value), {
      message: `expected one of ${property.knownValues.join(", ")}`,
    });
  }
  if (property.format === "datetime") {
    schema = schema.refine(
      (value) =>
        RFC3339_DATETIME.test(value) && !Number.isNaN(Date.parse(value)),
      { message: "expected datetime" },
    );
  }
  if (property.format === "uri") {
    schema = schema.refine(
      (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "expected uri" },
    );
  }
  return schema;
}

function buildAtprotoFieldSchema(
  property: AtprotoSchemaProperty,
): z.ZodType<unknown> {
  switch (property.type) {
    case "string":
      return buildAtprotoStringSchema(property);
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array": {
      const itemSchema = property.items
        ? buildAtprotoFieldSchema(property.items)
        : z.unknown();
      let schema = z.array(itemSchema);
      if (property.maxLength !== undefined) {
        schema = schema.max(property.maxLength);
      }
      return schema;
    }
    case "object":
      return buildAtprotoObjectSchema(property);
    case "blob":
      return z.custom<Record<string, unknown>>(isRecord, {
        message: "expected blob",
      });
    default:
      return z.unknown();
  }
}

function buildAtprotoObjectShape(
  property: AtprotoSchemaProperty,
): z.ZodRawShape {
  const requiredFields = new Set(property.required ?? []);
  const shape: z.ZodRawShape = {};
  for (const [field, fieldProperty] of Object.entries(
    property.properties ?? {},
  )) {
    const fieldSchema = buildAtprotoFieldSchema(fieldProperty);
    shape[field] = requiredFields.has(field)
      ? fieldSchema
      : fieldSchema.optional();
  }
  return shape;
}

function buildAtprotoObjectSchema(
  property: AtprotoSchemaProperty,
): AtprotoRecordSchema {
  return z.object(buildAtprotoObjectShape(property)).passthrough();
}

function reportUnexpectedFields(
  value: Record<string, unknown>,
  allowedFields: Set<string>,
  ctx: z.RefinementCtx,
  path: Array<string | number> = [],
): void {
  const unexpected = Object.keys(value).filter(
    (key) => !allowedFields.has(key),
  );
  if (unexpected.length === 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: `unrecognized field(s): ${unexpected.join(", ")}`,
  });
}

function refineBrainCardRecord(
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  reportUnexpectedFields(
    value,
    new Set([
      "$type",
      "siteUrl",
      "brain",
      "anchor",
      "skills",
      "model",
      "version",
      "createdAt",
      "updatedAt",
    ]),
    ctx,
  );
  if (isRecord(value["brain"])) {
    reportUnexpectedFields(
      value["brain"],
      new Set(["did", "name", "role", "purpose", "values"]),
      ctx,
      ["brain"],
    );
  }
  if (isRecord(value["anchor"])) {
    reportUnexpectedFields(
      value["anchor"],
      new Set(["did", "name", "kind"]),
      ctx,
      ["anchor"],
    );
  }
}

export function buildAtprotoRecordSchema(
  lexicon: AtprotoLexicon,
): AtprotoRecordSchema {
  const schema = z
    .object({
      ...buildAtprotoObjectShape(lexicon.defs.main.record),
      $type: z.literal(lexicon.id).optional(),
    })
    .passthrough();
  return lexicon.id === "ai.rizom.brain.card"
    ? schema.superRefine(refineBrainCardRecord)
    : schema;
}

export interface AtprotoBrainCardSkill extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

export interface AtprotoBrainCardBrain extends Record<string, unknown> {
  did: string;
  name: string;
  role: string;
  purpose: string;
  values: string[];
}

export interface AtprotoBrainCardAnchor extends Record<string, unknown> {
  did: string;
  name: string;
  kind: "professional" | "team" | "collective";
}

export interface AtprotoBrainCardRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.card";
  siteUrl: string;
  brain: AtprotoBrainCardBrain;
  anchor: AtprotoBrainCardAnchor;
  skills: AtprotoBrainCardSkill[];
  model: string;
  version: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainDeckRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.deck";
  title: string;
  slug?: string;
  description?: string;
  body: string;
  format?: "text/markdown";
  author?: string;
  event?: string;
  publishedAt?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainLinkRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.link";
  title: string;
  url: string;
  description?: string;
  summary?: string;
  domain?: string;
  capturedAt?: string;
  source?: { ref: string; label: string };
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainNoteRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.note";
  title: string;
  body: string;
  format?: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainPostRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.post";
  title: string;
  summary?: string;
  body: string;
  format?: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  canonicalUrl?: string;
  topics?: string[];
  coverImage?: {
    blob: AtprotoBlobRef;
    alt?: string;
    width?: number;
    height?: number;
  };
  series?: string;
  seriesIndex?: number;
  sourceEntityType?: "post";
  sourceEntityId?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface AtprotoBrainProjectRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.project";
  title: string;
  slug?: string;
  description?: string;
  body: string;
  format?: "text/markdown";
  year: number;
  url?: string;
  publishedAt?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainSeriesRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.series";
  title: string;
  slug?: string;
  description?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainSocialPostRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.socialPost";
  title: string;
  platform: string;
  body: string;
  format?: "text/markdown";
  status?: string;
  publishedAt?: string;
  platformPostId?: string;
  sourceLocalEntityType?: string;
  sourceLocalEntityId?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainTopicRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.topic";
  title: string;
  body: string;
  format?: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CanonicalAtprotoRecordMap {
  "ai.rizom.brain.card": AtprotoBrainCardRecord;
  "ai.rizom.brain.deck": AtprotoBrainDeckRecord;
  "ai.rizom.brain.link": AtprotoBrainLinkRecord;
  "ai.rizom.brain.note": AtprotoBrainNoteRecord;
  "ai.rizom.brain.post": AtprotoBrainPostRecord;
  "ai.rizom.brain.project": AtprotoBrainProjectRecord;
  "ai.rizom.brain.series": AtprotoBrainSeriesRecord;
  "ai.rizom.brain.socialPost": AtprotoBrainSocialPostRecord;
  "ai.rizom.brain.topic": AtprotoBrainTopicRecord;
}

export type CanonicalAtprotoRecord =
  CanonicalAtprotoRecordMap[keyof CanonicalAtprotoRecordMap];

export const canonicalAtprotoRecordSchemas = {
  "ai.rizom.brain.card": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.card"],
  ),
  "ai.rizom.brain.deck": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.deck"],
  ),
  "ai.rizom.brain.link": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.link"],
  ),
  "ai.rizom.brain.note": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.note"],
  ),
  "ai.rizom.brain.post": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.post"],
  ),
  "ai.rizom.brain.project": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.project"],
  ),
  "ai.rizom.brain.series": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.series"],
  ),
  "ai.rizom.brain.socialPost": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.socialPost"],
  ),
  "ai.rizom.brain.topic": buildAtprotoRecordSchema(
    canonicalAtprotoLexicons["ai.rizom.brain.topic"],
  ),
} satisfies Record<CanonicalAtprotoLexiconId, AtprotoRecordSchema>;

export type CanonicalAtprotoRecordSchemaId =
  keyof typeof canonicalAtprotoRecordSchemas;

export function listCanonicalAtprotoRecordSchemas(): AtprotoRecordSchema[] {
  return Object.values(canonicalAtprotoRecordSchemas);
}

export function getCanonicalAtprotoRecordSchema(
  id: string,
): AtprotoRecordSchema | undefined {
  return canonicalAtprotoRecordSchemas[id as CanonicalAtprotoLexiconId];
}

function formatAtprotoSchemaIssue(
  lexicon: AtprotoLexicon,
  record: Record<string, unknown>,
  issue: z.ZodIssue,
): string {
  const path = issue.path.join(".");
  if (path === "$type") {
    return `AT Protocol record $type must match lexicon id: ${String(
      record["$type"],
    )} !== ${lexicon.id}`;
  }
  if (issue.code === "invalid_type" && issue.received === "undefined") {
    return `Missing required AT Protocol record field: ${path}`;
  }
  if (issue.code === "invalid_type") {
    return `Invalid AT Protocol record field ${path}: expected ${issue.expected}`;
  }
  if (issue.code === "too_big") {
    return `Invalid AT Protocol record field ${path}: exceeds maxLength ${issue.maximum}`;
  }
  if (issue.code === "custom") {
    return `Invalid AT Protocol record field ${path}: ${issue.message}`;
  }
  if (issue.code === "unrecognized_keys") {
    return `Unrecognized AT Protocol record field(s): ${issue.keys.join(", ")}`;
  }
  return `Invalid AT Protocol record field ${path}: ${issue.message}`;
}

export function validateAtprotoRecord(
  lexicon: AtprotoLexicon,
  record: Record<string, unknown>,
): void {
  const result = buildAtprotoRecordSchema(lexicon).safeParse(record);
  if (result.success) return;
  const issue = result.error.issues[0];
  if (!issue) throw result.error;
  throw new Error(formatAtprotoSchemaIssue(lexicon, record, issue));
}

export const ATPROTO_BRAIN_CARD_DISCOVERED = "atproto:brain-card-discovered";
export const ATPROTO_BRAIN_DISCOVERED = "atproto:brain-discovered";
export const ATPROTO_BRAIN_CARD_REFRESHED = "atproto:brain-card-refreshed";

export const atprotoBrainCardDiscoveredPayloadSchema = z
  .object({
    repoDid: z.string().min(1),
    uri: z.string().min(1),
    cid: z.string().min(1),
    // The card schema validates the full nested card shape, so the parsed
    // record can be consumed as a typed AtprotoBrainCardRecord rather than an
    // untyped property bag.
    record: canonicalAtprotoRecordSchemas[
      "ai.rizom.brain.card"
    ] as unknown as z.ZodType<AtprotoBrainCardRecord>,
  })
  .strict();

export type AtprotoBrainCardDiscoveredPayload = z.infer<
  typeof atprotoBrainCardDiscoveredPayloadSchema
>;

export const atprotoBrainDiscoveryEventPayloadSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().min(1),
    url: z.string().url(),
    status: z.enum(["discovered", "approved"]),
    repoDid: z.string().min(1).optional(),
    brainDid: z.string().min(1).optional(),
    anchorDid: z.string().min(1).optional(),
    cardUri: z.string().min(1).optional(),
    cardCid: z.string().min(1).optional(),
  })
  .strict();

export type AtprotoBrainDiscoveryEventPayload = z.infer<
  typeof atprotoBrainDiscoveryEventPayloadSchema
>;

export interface AtprotoBlobRef {
  $type?: "blob" | undefined;
  ref: { $link: string };
  mimeType: string;
  size: number;
}

/**
 * Subset of the AT Protocol plugin config that entity projections may read when
 * building records. Projections do not authenticate or write, so PDS auth and
 * transport fields (identifier, endpoint, credentials, repo DID) are
 * intentionally excluded — they stay on the plugin's own config.
 */
export interface AtprotoPublishConfig {
  brainDid?: string | undefined;
  anchorDid?: string | undefined;
}

export interface AtprotoPdsClientLike {
  createSession(): Promise<{
    did: string;
    handle: string;
    accessJwt: string;
    refreshJwt: string;
  }>;
  createRecord(input: {
    repo: string;
    collection: string;
    record: Record<string, unknown>;
    rkey?: string;
    validate?: boolean;
  }): Promise<{ uri: string; cid: string }>;
  putRecord?(input: {
    repo: string;
    collection: string;
    record: Record<string, unknown>;
    rkey: string;
    validate?: boolean;
  }): Promise<{ uri: string; cid: string }>;
  getRecord?(input: {
    repo: string;
    collection: string;
    rkey: string;
  }): Promise<{ uri: string; cid: string; value: Record<string, unknown> }>;
  uploadBlob?(input: {
    data: Buffer;
    mimeType: string;
  }): Promise<{ blob: AtprotoBlobRef }>;
}

export interface AtprotoProjectionBuildInput {
  entity: BaseEntity;
  context: ServicePluginContext;
  config: AtprotoPublishConfig;
  client?: AtprotoPdsClientLike;
  topics?: string[];
  dryRun?: boolean;
}

export type AtprotoProjectedPostRecord = AtprotoBrainPostRecord;

export interface AtprotoProjectionPublishedInput<
  TRecord extends Record<string, unknown>,
> {
  entity: BaseEntity;
  context: ServicePluginContext;
  record: TRecord;
  uri: string;
  cid: string;
}

export interface AtprotoProjection<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
> {
  entityType: string;
  collection: string;
  lexicon: AtprotoLexicon;
  validate?: boolean;
  buildRecord(input: AtprotoProjectionBuildInput): Promise<TRecord>;
  onPublished?(input: AtprotoProjectionPublishedInput<TRecord>): Promise<void>;
}

export class AtprotoProjectionRegistry {
  private static instance: AtprotoProjectionRegistry | undefined;
  private readonly projections = new Map<string, AtprotoProjection>();
  private readonly registrationCounts = new Map<string, number>();

  static getInstance(): AtprotoProjectionRegistry {
    this.instance ??= new AtprotoProjectionRegistry();
    return this.instance;
  }

  static createFresh(): AtprotoProjectionRegistry {
    return new AtprotoProjectionRegistry();
  }

  static resetInstance(): void {
    this.instance = undefined;
  }

  register<TRecord extends Record<string, unknown>>(
    projection: AtprotoProjection<TRecord>,
  ): () => void {
    this.validateProjection(projection);
    const existing = this.projections.get(projection.entityType);
    if (existing) {
      if (!this.isEquivalentProjection(existing, projection)) {
        throw new Error(
          `AT Protocol projection already registered for entity type ${projection.entityType}`,
        );
      }
      this.registrationCounts.set(
        projection.entityType,
        (this.registrationCounts.get(projection.entityType) ?? 1) + 1,
      );
      return this.createUnregister(projection.entityType);
    }

    this.projections.set(projection.entityType, projection);
    this.registrationCounts.set(projection.entityType, 1);
    return this.createUnregister(projection.entityType);
  }

  get(
    entityType: "post",
  ): AtprotoProjection<AtprotoProjectedPostRecord> | undefined;
  get(entityType: string): AtprotoProjection | undefined;
  get(entityType: string): AtprotoProjection | undefined {
    return this.projections.get(entityType);
  }

  has(entityType: string): boolean {
    return this.projections.has(entityType);
  }

  list(): AtprotoProjection[] {
    return Array.from(this.projections.values());
  }

  listLexicons(): AtprotoLexicon[] {
    return this.list().map((projection) => projection.lexicon);
  }

  private createUnregister(entityType: string): () => void {
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const count = this.registrationCounts.get(entityType) ?? 0;
      if (count <= 1) {
        this.registrationCounts.delete(entityType);
        this.projections.delete(entityType);
        return;
      }
      this.registrationCounts.set(entityType, count - 1);
    };
  }

  private isEquivalentProjection(
    existing: AtprotoProjection,
    projection: AtprotoProjection,
  ): boolean {
    return (
      existing.entityType === projection.entityType &&
      existing.collection === projection.collection &&
      existing.lexicon.id === projection.lexicon.id &&
      existing.validate === projection.validate
    );
  }

  private validateProjection(projection: AtprotoProjection): void {
    if (projection.collection !== projection.lexicon.id) {
      throw new Error(
        `AT Protocol projection collection must match lexicon id: ${projection.collection} !== ${projection.lexicon.id}`,
      );
    }
    if (!projection.lexicon.defs.main.key) {
      throw new Error(
        `AT Protocol projection lexicon must define a record key: ${projection.collection}`,
      );
    }
  }
}
