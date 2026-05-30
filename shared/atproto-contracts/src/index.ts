import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";

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

export interface AtprotoBlobRef {
  $type?: "blob" | undefined;
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface AtprotoPublishConfig {
  enabled: boolean;
  pdsEndpoint: string;
  identifier?: string | undefined;
  repoDid?: string | undefined;
  brainDid?: string | undefined;
  anchorDid?: string | undefined;
  appPassword?: string | undefined;
  appPasswordEnv?: string | undefined;
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
    this.projections.set(projection.entityType, projection);
    return () => {
      if (this.projections.get(projection.entityType) === projection) {
        this.projections.delete(projection.entityType);
      }
    };
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
