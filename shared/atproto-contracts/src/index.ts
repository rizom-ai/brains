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

interface AtprotoValidationProperty extends AtprotoLexiconProperty {
  required?: string[] | undefined;
  properties?: Record<string, AtprotoValidationProperty> | undefined;
  items?: AtprotoValidationProperty | undefined;
  knownValues?: string[] | undefined;
  maxLength?: number | undefined;
  format?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// RFC 3339 date-time with required offset (Z or ±hh:mm), matching the AT
// Protocol `datetime` string format. Lenient Date.parse would accept "2026-01-01".
const RFC3339_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function validateScalarFormat(
  path: string,
  value: string,
  property: AtprotoValidationProperty,
): void {
  if (
    property.format === "datetime" &&
    (!RFC3339_DATETIME.test(value) || Number.isNaN(Date.parse(value)))
  ) {
    throw new Error(
      `Invalid AT Protocol record field ${path}: expected datetime`,
    );
  }
  if (property.format === "uri") {
    try {
      new URL(value);
    } catch {
      throw new Error(`Invalid AT Protocol record field ${path}: expected uri`);
    }
  }
}

function validateKnownValues(
  path: string,
  value: string,
  property: AtprotoValidationProperty,
): void {
  if (property.knownValues && !property.knownValues.includes(value)) {
    throw new Error(
      `Invalid AT Protocol record field ${path}: expected one of ${property.knownValues.join(", ")}`,
    );
  }
}

function validateAtprotoField(
  path: string,
  value: unknown,
  property: AtprotoValidationProperty,
): void {
  switch (property.type) {
    case "string": {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid AT Protocol record field ${path}: expected string`,
        );
      }
      if (
        property.maxLength !== undefined &&
        value.length > property.maxLength
      ) {
        throw new Error(
          `Invalid AT Protocol record field ${path}: exceeds maxLength ${property.maxLength}`,
        );
      }
      validateKnownValues(path, value, property);
      validateScalarFormat(path, value, property);
      return;
    }
    case "integer": {
      if (!Number.isInteger(value)) {
        throw new Error(
          `Invalid AT Protocol record field ${path}: expected integer`,
        );
      }
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new Error(
          `Invalid AT Protocol record field ${path}: expected boolean`,
        );
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        throw new Error(
          `Invalid AT Protocol record field ${path}: expected array`,
        );
      }
      if (
        property.maxLength !== undefined &&
        value.length > property.maxLength
      ) {
        throw new Error(
          `Invalid AT Protocol record field ${path}: exceeds maxLength ${property.maxLength}`,
        );
      }
      const itemProperty = property.items;
      if (itemProperty) {
        value.forEach((item, index) => {
          validateAtprotoField(`${path}.${index}`, item, itemProperty);
        });
      }
      return;
    }
    case "object": {
      if (!isRecord(value)) {
        throw new Error(
          `Invalid AT Protocol record field ${path}: expected object`,
        );
      }
      validateAtprotoObject(path, value, property);
      return;
    }
    case "blob": {
      if (!isRecord(value)) {
        throw new Error(
          `Invalid AT Protocol record field ${path}: expected blob`,
        );
      }
      return;
    }
    default:
      return;
  }
}

function validateAtprotoObject(
  path: string,
  value: Record<string, unknown>,
  property: AtprotoValidationProperty,
): void {
  for (const field of property.required ?? []) {
    if (value[field] === undefined || value[field] === null) {
      const qualifiedPath = path ? `${path}.${field}` : field;
      throw new Error(
        `Missing required AT Protocol record field: ${qualifiedPath}`,
      );
    }
  }

  for (const [field, fieldProperty] of Object.entries(
    property.properties ?? {},
  )) {
    const fieldValue = value[field];
    if (fieldValue === undefined || fieldValue === null) continue;
    const qualifiedPath = path ? `${path}.${field}` : field;
    validateAtprotoField(qualifiedPath, fieldValue, fieldProperty);
  }
}

export function validateAtprotoRecord(
  lexicon: AtprotoLexicon,
  record: Record<string, unknown>,
): void {
  const type = record["$type"];
  if (type !== undefined && type !== lexicon.id) {
    throw new Error(
      `AT Protocol record $type must match lexicon id: ${String(type)} !== ${lexicon.id}`,
    );
  }

  validateAtprotoObject("", record, lexicon.defs.main.record);
}

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

export interface AtprotoProjectedPostRecord extends Record<string, unknown> {
  title: string;
  sourceEntityType: string;
  sourceEntityId: string;
  createdAt: string;
  coverImage?: unknown;
}

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
