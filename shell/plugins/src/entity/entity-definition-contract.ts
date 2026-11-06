import type { FeedItem } from "@brains/site-composition";
import type {
  EntityActionPolicyRuleInput,
  Template,
  ViewTemplate,
} from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type { JsonObject, JsonObjectOutputGuard } from "@brains/contracts";
import type {
  BaseEntity,
  CreateCheckResult,
  CreateInput,
  CreateResultAttachment,
  EntitySchema,
  EntityTypeClassification,
  PaginationInfo,
} from "@brains/entity-service";
import type { AnchorProfile } from "../contracts/identity";
import type { AttachmentProvider } from "../service/attachment-registry";
import type {
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
} from "../service/upload-registry";
import type {
  BaseQuery,
  NavigationResult,
} from "../service/base-entity-datasource";
import type { EntityDefinitionConfig } from "./entity-definition-config";

export type { EntityDefinitionConfig } from "./entity-definition-config";

export type EntityVisibility = "public" | "shared" | "restricted";
export type EntityMetadataSchema = z.ZodObject<z.ZodRawShape>;

export interface EntityMarkdownDocument<TMetadata> {
  readonly content: string;
  readonly metadata: TMetadata;
}

export interface EncodedEntityMarkdown {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}

export interface EntityMarkdownCodec<
  TMetadataSchema extends EntityMetadataSchema,
> {
  decode(input: {
    readonly content: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
  }): EntityMarkdownDocument<z.input<TMetadataSchema>>;
  encode(
    input: EntityMarkdownDocument<z.output<TMetadataSchema>>,
  ): EncodedEntityMarkdown;
}

/**
 * Lifecycle moments a seed may attach to, named rather than given as
 * channel strings so the public surface never names an internal channel.
 *
 * `startup-content-settled` fires once startup content is in place: after a
 * pending initial sync succeeded, or at boot when none was pending. It is
 * the only safe point to write a default, since seeding earlier could race
 * synced content and resurrect something deleted upstream. After a failed
 * sync it does not fire, so a default is never exported over unimported files.
 */
export type EntitySeedTrigger = "startup-content-settled";

/**
 * A default entity the brain should hold before anyone authors one, such
 * as a house style guide.
 *
 * Seeding is create-if-absent: an entity with this id, at any visibility,
 * is never overwritten, so a seed cannot clobber authored content.
 */
export interface EntitySeedDefinition<
  TMetadataSchema extends EntityMetadataSchema,
> {
  readonly on: EntitySeedTrigger;
  readonly id: string;
  /** Lazy, so the default is only built when it is actually needed. */
  readonly content: () => string;
  readonly metadata?: z.input<TMetadataSchema> | undefined;
}

/**
 * How a type contributes to a syndication feed. The type says how one of its
 * records becomes an item; the site build decides which records qualify
 * (published only, or everything in a preview), where the file goes, and how
 * a slug becomes a URL.
 */
export interface EntityFeedDeclaration<TEntity> {
  /** Path the feed is written to, relative to the build output. */
  readonly path: string;
  /** Route prefix the feed's channel link hangs off, e.g. "posts". */
  readonly routePrefix: string;
  /** Null for a record that does not belong in the feed. */
  toItem(entity: TEntity): FeedItem | null;
}

export interface EntityDefinition<
  TType extends string = string,
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> {
  readonly kind: "rizom-entity";
  readonly type: TType;
  readonly purpose: string;
  readonly classification: EntityTypeClassification;
  readonly metadata: TMetadataSchema;
  /**
   * Normalize stored metadata before the schema sees it, so records written
   * before a shape changed still parse. Declared beside `metadata` rather
   * than folded into it, so the schema stays an object shape. It must return
   * current metadata unchanged.
   */
  readonly metadataFrom?: ((stored: unknown) => unknown) | undefined;
  /** One authored record, whose id is the entity type. */
  readonly singleton?: boolean | undefined;
  /** False when the type has no free-form body below its frontmatter. */
  readonly hasBody?: boolean | undefined;
  readonly markdown?: EntityMarkdownCodec<TMetadataSchema> | undefined;
  /**
   * A label derived from the record, for where it is shown. Reading it never
   * writes the stored record; no label falls back to the record's own title.
   */
  displayTitle?(entity: {
    readonly content: string;
    readonly metadata: z.output<TMetadataSchema>;
  }): string | undefined;
  /** Entity-type settings; omitted keys keep the runtime defaults. */
  readonly config?: EntityDefinitionConfig | undefined;
  /**
   * A persistence invariant, checked before every create and update of this
   * type, including installs without a service. Throwing rejects the write.
   */
  readonly validatePersist?:
    | ((entity: {
        readonly content: string;
        readonly visibility: EntityVisibility;
      }) => void | Promise<void>)
    | undefined;
  /**
   * Who may do what to this type, when the platform baseline is not right:
   * this type's own rule in the brain's action policy. It overrides the
   * brain's wildcard defaults action by action, and the brain's own rules
   * for this type override it in turn. `config.actionPolicy` is the other
   * form, a minimum that only tightens the wildcard defaults.
   */
  readonly actions?: EntityActionPolicyRuleInput | undefined;
  /** Whether this type carries a cover image in `coverImageId`. */
  readonly coverImage?: boolean | undefined;
  readonly seed?: EntitySeedDefinition<TMetadataSchema> | undefined;
  /**
   * Templates keyed by local name. The runtime registers each under this
   * type's scope, and a template whose `dataSourceId` names one of its
   * package's data sources follows it to the scoped id.
   */
  readonly templates?: Readonly<Record<string, Template>> | undefined;
  /**
   * How `system_create` treats this type, routed by the shape of the
   * request. Unrouted shapes go on to ordinary creation.
   */
  readonly create?: EntityCreateRouting<TMetadataSchema> | undefined;
  /** Source-derived artifacts of this type, such as a printable PDF. */
  readonly attachments?: readonly EntityAttachmentDeclaration[] | undefined;
  /** This type's syndication feed, written into every site build. */
  readonly feed?:
    | EntityFeedDeclaration<EntityOf<EntityDefinition<TType, TMetadataSchema>>>
    | undefined;
}

export type AnyEntityDefinition = EntityDefinition<
  string,
  EntityMetadataSchema
>;

export interface EntityOf<TDefinition extends AnyEntityDefinition> {
  readonly id: string;
  readonly entityType: TDefinition["type"];
  readonly content: string;
  readonly visibility: EntityVisibility;
  readonly metadata: z.output<TDefinition["metadata"]>;
  readonly contentHash: string;
  readonly created: string;
  readonly updated: string;
}

export interface EntityWriteInput<TDefinition extends AnyEntityDefinition> {
  readonly id: string;
  readonly content: string;
  readonly visibility?: EntityVisibility | undefined;
  readonly metadata: z.input<TDefinition["metadata"]>;
}

export interface ProjectionTarget<TTarget extends AnyEntityDefinition> {
  upsert(input: EntityWriteInput<TTarget>): Promise<void>;
}

export interface ProjectionDefinition<
  TSource extends AnyEntityDefinition = AnyEntityDefinition,
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
> {
  readonly kind: "rizom-projection";
  readonly id: string;
  readonly source: TSource;
  readonly target: TTarget;
  project(context: {
    readonly source: EntityOf<TSource>;
    readonly target: ProjectionTarget<TTarget>;
    readonly signal: AbortSignal;
  }): Promise<void>;
}

/** One field a declared list is ordered by. */
export interface DataSourceSortField {
  readonly field: string;
  readonly direction: "asc" | "desc";
  readonly nullsFirst?: boolean | undefined;
  readonly nullsLast?: boolean | undefined;
}

/** How a declared data source asks for a list in order. */
export interface DataSourceListOptions {
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  readonly sort?: readonly DataSourceSortField[] | undefined;
}

/**
 * The reads a declared data source is given, typed by the definitions it
 * names. Reads see what the build may show: public records, and only
 * published ones when the build asks for that.
 */
export interface DataSourceEntityReader {
  get<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    id: string,
  ): Promise<EntityOf<TDefinition> | null>;
  list<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    options?: DataSourceListOptions,
  ): Promise<readonly EntityOf<TDefinition>[]>;
  count<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
  ): Promise<number>;
}

/** What the build tells a data source about the read it is serving. */
export interface DataSourceReadContext {
  /** True for a production build, which shows only published records. */
  readonly publishedOnly?: boolean | undefined;
}

/**
 * A source of data a template reads from: one `fetch` over definition-typed
 * reads. The author returns plain data and the runtime validates it against
 * the caller's schema.
 */
export interface DataSourceDefinition {
  readonly kind: "rizom-data-source";
  /** Local id. The runtime scopes it to the installed package. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  fetch(
    query: unknown,
    entities: DataSourceEntityReader,
    context: DataSourceReadContext,
  ): Promise<unknown>;
}

/** The query a template sends a list-and-detail source. */
export type DataSourceQuery = BaseQuery;

/**
 * What a detail view is given. `siblings` is the list the runtime already
 * loads to resolve prev/next, so a view that orders its neighbors
 * differently computes that itself.
 */
export interface EntityDetailContext<TTransformed> {
  readonly item: TTransformed;
  readonly navigation: NavigationResult<TTransformed> | null;
  readonly siblings: readonly TTransformed[];
  readonly entities: DataSourceEntityReader;
}

/**
 * A list-and-detail source over one declared type. The runtime derives the
 * entity schema from `entity`, as `EntityOf` does, and keeps every read —
 * listing, counting, paging, lookup and prev/next — on its own side; the
 * author supplies order and pure functions over loaded entities.
 */
export interface EntityDataSourceInput<
  TDefinition extends AnyEntityDefinition,
  TTransformed,
  TListResult extends object,
> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly entity: TDefinition;
  readonly defaultSort: readonly DataSourceSortField[];
  /** Items per list page when the query names no page size (default 100). */
  readonly defaultLimit?: number | undefined;
  /** How a detail query's `id` finds the entity (default: `metadata.slug`). */
  readonly lookupField?: "slug" | "id" | undefined;
  /** Resolve prev/next for a detail view (default false). */
  readonly enableNavigation?: boolean | undefined;
  /** Most entities read to resolve prev/next (default 1000). */
  readonly navigationLimit?: number | undefined;
  /**
   * Narrow the list by something the query asked for, as an exact match on
   * the type's own metadata. Applied in the database query, so a filtered
   * list pages over the filtered set.
   */
  filter?(query: DataSourceQuery):
    | {
        readonly metadata?:
          Partial<z.output<TDefinition["metadata"]>> | undefined;
      }
    | undefined;
  transform(entity: EntityOf<TDefinition>): TTransformed;
  list(
    items: readonly TTransformed[],
    pagination: PaginationInfo | null,
    query: DataSourceQuery,
  ): TListResult & JsonObjectOutputGuard<TListResult>;
  detail?(
    context: EntityDetailContext<TTransformed>,
  ): unknown | Promise<unknown>;
}

export interface EntityDataSourceDefinition<
  TDefinition extends AnyEntityDefinition = AnyEntityDefinition,
  TTransformed = EntityOf<TDefinition>,
  TListResult extends object = JsonObject,
> extends EntityDataSourceInput<TDefinition, TTransformed, TListResult> {
  readonly kind: "rizom-entity-data-source";
}

/**
 * An entity data source with its types erased, as a package stores a
 * heterogeneous list of them. Method syntax keeps a source that transforms
 * to a concrete shape assignable here.
 */
export interface AnyEntityDataSourceDefinition {
  readonly kind: "rizom-entity-data-source";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly entity: AnyEntityDefinition;
  readonly defaultSort: readonly DataSourceSortField[];
  readonly defaultLimit?: number | undefined;
  readonly lookupField?: "slug" | "id" | undefined;
  readonly enableNavigation?: boolean | undefined;
  readonly navigationLimit?: number | undefined;
  filter?(
    query: DataSourceQuery,
  ):
    | { readonly metadata?: Readonly<Record<string, unknown>> | undefined }
    | undefined;
  transform(entity: EntityOf<AnyEntityDefinition>): unknown;
  /** Typed JSON at the declaration; the caller's schema validates it. */
  list(
    items: readonly unknown[],
    pagination: PaginationInfo | null,
    query: DataSourceQuery,
  ): object;
  detail?(context: EntityDetailContext<unknown>): unknown | Promise<unknown>;
}

/** Either declared form, as a package stores them. */
export type AnyDataSourceDeclaration =
  AnyEntityDataSourceDefinition | DataSourceDefinition;

/**
 * What an attachment provider is built with: the media members providers
 * use, as frozen, bound, read-only handles. `EntityPluginContext` satisfies
 * it, so a provider factory works for declared and class-based types alike.
 */
/** One stored record a media provider reads. */
export interface MediaEntityRequest {
  readonly entityType: string;
  readonly id: string;
}

/** Records of one type a media provider reads, such as a singleton. */
export interface MediaEntityListRequest {
  readonly entityType: string;
  readonly options?: { readonly limit?: number } | undefined;
}

/**
 * The entity reads a media provider uses: a stored record, or one parsed by
 * the schema that proves its shape. Reads see public records only; a
 * request cannot name another visibility.
 */
export interface MediaEntityReads {
  getEntity(request: MediaEntityRequest): Promise<BaseEntity | null>;
  getEntity<T extends BaseEntity>(
    request: MediaEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  listEntities(request: MediaEntityListRequest): Promise<BaseEntity[]>;
  listEntities<T extends BaseEntity>(
    request: MediaEntityListRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
}

export interface MediaAttachmentContext {
  readonly domain: string | undefined;
  readonly themeCSS: string;
  readonly identity: { getProfile(): AnchorProfile };
  readonly entityService: MediaEntityReads;
  /** Registered view templates an artifact is rendered from. */
  readonly views: { get(name: string): ViewTemplate | undefined };
}

/**
 * A source-derived artifact of this type. The provider is a factory because
 * the media context exists only once the type is registered; the runtime
 * registers it and releases it on shutdown.
 */
export interface EntityAttachmentDeclaration {
  /** Semantic attachment type, e.g. "printable" or "og-image". */
  readonly type: string;
  provider(context: MediaAttachmentContext): AttachmentProvider;
}

/**
 * A link a create hands back, built from the id the runtime actually wrote.
 */
export type EntityCreateAttachment = (written: {
  readonly entityId: string;
}) => CreateResultAttachment;

/** The uploads a create request may refer to, read-only. */
export interface EntityCreateUploadReader {
  read(uploadId: string): Promise<ResolvedRuntimeUpload>;
  readRecord(uploadId: string): Promise<RuntimeUploadRecord>;
}

/**
 * What a create route decides with: the request, reads at the caller's
 * visibility, and the uploads the request may refer to. All of it is
 * frozen; a route returns what should happen and the runtime does it.
 */
export interface EntityCreateContext {
  readonly input: Readonly<CreateInput>;
  readonly entities: DataSourceEntityReader;
  readonly uploads: EntityCreateUploadReader;
}

/**
 * A route's answer before the user confirms a create: ready (with the title
 * and fields it derived), a question to ask first, or an error.
 */
export type EntityCreateCheck = CreateCheckResult;

/**
 * What a create route decided. Content rather than a completed write: the
 * runtime performs it and reports what happened, so a route cannot claim a
 * create it did not make.
 */
export type EntityCreateResolution<
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> =
  | {
      readonly create: {
        readonly id: string;
        readonly content: string;
        readonly metadata: z.input<TMetadataSchema>;
      };
      readonly attachment?: EntityCreateAttachment | undefined;
    }
  /** The thing asked for already exists; nothing is written. */
  | {
      readonly existing: { readonly id: string };
      readonly attachment?: EntityCreateAttachment | undefined;
    }
  | {
      readonly update: {
        readonly id: string;
        readonly content: string;
        readonly metadata: z.input<TMetadataSchema>;
      };
    }
  | { readonly refuse: string };

/**
 * What to do with a create request of one shape: refuse it outright, or
 * resolve it — optionally checking it first, before the user is asked to
 * confirm.
 */
export type EntityCreateRoute<
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> =
  | { readonly reject: string }
  | {
      check?(context: EntityCreateContext): Promise<EntityCreateCheck>;
      resolve(
        context: EntityCreateContext,
      ): Promise<EntityCreateResolution<TMetadataSchema>>;
    };

/**
 * Create routing, keyed by how the caller expressed what they want:
 *
 * - `fromPrompt`: described in words.
 * - `fromUpload`: an uploaded file. `mediaTypes` also claims those uploads
 *   from the upload endpoint, through the same route.
 * - `fromAttachment`: another entity's attachment, such as a rendered PDF.
 * - `fromContent`: the content itself, pasted or taken from a message.
 */
export interface EntityCreateRouting<
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> {
  readonly fromPrompt?: EntityCreateRoute<TMetadataSchema> | undefined;
  readonly fromUpload?:
    | (EntityCreateRoute<TMetadataSchema> & {
        readonly mediaTypes?: readonly string[] | undefined;
      })
    | undefined;
  readonly fromAttachment?: EntityCreateRoute<TMetadataSchema> | undefined;
  readonly fromContent?: EntityCreateRoute<TMetadataSchema> | undefined;
}
