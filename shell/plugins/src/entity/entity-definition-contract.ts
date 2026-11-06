import type { AtprotoBlobRef, AtprotoLexicon } from "@brains/atproto-contracts";
import type { FeedItem } from "@brains/site-composition";
import type { PublishProvider } from "@brains/contracts";
import type {
  RecurringAlert,
  RecurringCheckCadence,
  RecurringCheckResult,
} from "@brains/recurring-checks";
import type {
  EntityActionPolicyRuleInput,
  Template,
  UserPermissionLevel,
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
import type { ProjectionRule } from "./projection-rule";
import type {
  InboxActor,
  InboxFacetDefinition,
  InboxItem,
  InboxItemDetail,
} from "../inbox-registry";
import type { AttachmentProvider } from "../service/attachment-registry";
import type {
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
} from "../service/upload-registry";
import type {
  BaseQuery,
  NavigationResult,
} from "../service/base-entity-datasource";
import type { AgentContextItem, AgentContextRequest } from "@brains/contracts";
import type {
  EntityDefinitionConfig,
  EntityScheduledGenerationDeclaration,
} from "./entity-definition-config";

export type {
  EntityDefinitionConfig,
  EntityScheduledGenerationDeclaration,
} from "./entity-definition-config";

export type EntityVisibility = "public" | "shared" | "restricted";
export type EntityMetadataSchema = z.ZodObject<z.ZodRawShape>;

type ReadonlyInput<T> = T extends Date | ((...args: never[]) => unknown)
  ? T
  : { readonly [K in keyof T]: ReadonlyInput<T[K]> };

/**
 * Metadata a definition writes — a seed, a stub, a decoded document, a
 * create or a generation result: the schema's input, also accepted
 * read-only.
 *
 * Spelled through the schema's own input slot so that, with `defineEntity`
 * taking its schema as a `const` parameter, a literal written inline is in a
 * const context. It then keeps its literal type even before the schema is
 * inferred, which TypeScript has not yet done when it checks a callback
 * without parameters. A const context makes arrays read-only, hence the
 * read-only form.
 */
type EntityMetadataInput<TMetadataSchema extends EntityMetadataSchema> =
  TMetadataSchema["_zod"]["input"] | ReadonlyInput<z.input<TMetadataSchema>>;

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
  }): EntityMarkdownDocument<EntityMetadataInput<TMetadataSchema>>;
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
  readonly metadata?: EntityMetadataInput<TMetadataSchema> | undefined;
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

/**
 * How this type is published. The brain's publish pipeline calls the
 * provider when a record goes out, then records the outcome on the record
 * itself: its status becomes `published`, the time goes in
 * `timestampField` (`publishedAt` by default), and the provider's result
 * id in `resultIdField` when one is named. Both fields belong in the
 * metadata schema.
 */
export interface EntityPublishDeclaration<
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> {
  readonly provider: PublishProvider;
  readonly resultIdField?: MetadataField<TMetadataSchema> | undefined;
  readonly timestampField?: MetadataField<TMetadataSchema> | undefined;
}

type MetadataField<TMetadataSchema extends EntityMetadataSchema> = Extract<
  keyof z.output<TMetadataSchema>,
  string
>;

/**
 * An image the publish pipeline renders before a record goes out, such as
 * a social card. It is rendered from one of this type's attachments through
 * the brain's image job, saved as an image entity, and its id recorded in
 * `field`. A record whose field is already set keeps it.
 */
export interface EntityPublishAssetDeclaration {
  /** The attachment it is rendered from; the type declares it in `attachments`. */
  readonly attachmentType: string;
  /** `coverImageId` requires `coverImage: true`. */
  readonly field: "coverImageId" | "ogImageId";
  /** Only records in this state need it. */
  readonly requiredWhen?:
    | {
        readonly status?: string | undefined;
        readonly visibility?: EntityVisibility | undefined;
      }
    | undefined;
}

/**
 * What an entity type binds its dashboard widgets to: it has no config,
 * state or account settings. A widget definition's `bind` takes it.
 */
export interface EntityDashboardBindingContext {
  readonly config: Readonly<Record<string, never>>;
  readonly state: Readonly<Record<string, never>>;
  readonly accountSettings: undefined;
}

/**
 * A dashboard widget an entity type has bound to its loader: what
 * `defineDashboardWidget(...).bind(context, load)` returns. Stated by its
 * shape so the entity contract does not depend on the operator one, whose
 * loaders read entity definitions; the runtime checks it is a binding.
 */
export interface EntityDashboardWidget {
  readonly kind: "rizom-dashboard-widget-binding";
  readonly definition: { readonly id: string };
}

/** Definition-typed reads of the declaring type alone. */
export interface EntityRecordReader<TEntity> {
  get(id: string): Promise<TEntity | null>;
  list(options?: DataSourceListOptions): Promise<readonly TEntity[]>;
}

/** What an Inbox action may change on the record it acts on. */
export interface EntityInboxChange<TDefinition extends AnyEntityDefinition> {
  readonly content?: string | undefined;
  readonly metadata?: EntityMetadataInput<TDefinition["metadata"]> | undefined;
}

/**
 * The writes an Inbox action makes, as the actor and to the record it read.
 * Each is refused when the actor may not take that action on the type, and
 * when the record changed after it was read, so an operator never acts on
 * something other than what they saw.
 */
export interface EntityInboxEdits<TDefinition extends AnyEntityDefinition> {
  update(
    record: EntityOf<TDefinition>,
    change: EntityInboxChange<TDefinition>,
  ): Promise<void>;
  /** An update that publishes, which the action policy may hold to more. */
  publish(
    record: EntityOf<TDefinition>,
    change: EntityInboxChange<TDefinition>,
  ): Promise<void>;
  delete(record: EntityOf<TDefinition>): Promise<void>;
}

/** What listing the Inbox reads with: everything the package holds. */
export interface EntityInboxListContext<
  TDefinition extends AnyEntityDefinition,
> {
  /** The declaring type's records, at every visibility. */
  readonly records: EntityRecordReader<EntityOf<TDefinition>>;
  /** Reads of any type, at every visibility. */
  readonly entities: EntityReader;
}

/** What an operator opening or acting on an item reads with: their own view. */
export interface EntityInboxDetailContext<
  TDefinition extends AnyEntityDefinition,
> {
  readonly actor: InboxActor;
  /** The declaring type's records, at the actor's visibility. */
  readonly records: EntityRecordReader<EntityOf<TDefinition>>;
  /** Reads of any type, at the actor's visibility. */
  readonly entities: EntityReader;
  readonly signal: AbortSignal;
}

export interface EntityInboxActionContext<
  TDefinition extends AnyEntityDefinition,
> extends Omit<EntityInboxDetailContext<TDefinition>, "signal"> {
  readonly edits: EntityInboxEdits<TDefinition>;
}

/**
 * What this type puts in front of the operator to act on. Items are listed
 * for the Inbox, opened for detail and acted on by action id; the brain
 * validates every item and shows only actions the item declares.
 */
export interface EntityInboxDeclaration<
  TDefinition extends AnyEntityDefinition = AnyEntityDefinition,
> {
  /** Brain-wide, kebab-case: one source per id. */
  readonly sourceId: string;
  readonly displayName: string;
  readonly facets?: readonly InboxFacetDefinition[] | undefined;
  list(
    context: EntityInboxListContext<TDefinition>,
  ): Promise<readonly InboxItem[]>;
  resolveDetail?(
    itemId: string,
    context: EntityInboxDetailContext<TDefinition>,
  ): Promise<InboxItemDetail>;
  act(
    itemId: string,
    actionId: string,
    context: EntityInboxActionContext<TDefinition>,
  ): Promise<void>;
}

/** How often a check runs. */
export type EntityCheckCadence = RecurringCheckCadence;

/**
 * One condition a check raises. Keep `dedupeKey` stable while the
 * condition lasts and change it when the condition changes; alerts are
 * operational state and must not carry secrets.
 */
export type EntityCheckAlert = RecurringAlert;

export type EntityCheckResult = RecurringCheckResult;

/** What a check runs with. */
export interface EntityCheckContext {
  /** Definition-typed reads as the package, at every visibility. */
  readonly entities: EntityReader;
  /**
   * The brain's own address, for a link an alert sends. Undefined on a
   * brain nobody outside can reach.
   */
  readonly siteUrl: string | undefined;
  /** Aborted when the run is cancelled or the brain stops. */
  readonly signal: AbortSignal;
}

/**
 * A check the brain runs on a schedule. The alerts it returns are delivered
 * to the operator and shown in the Inbox, each once per condition.
 */
export interface EntityCheckDeclaration {
  /** Local to the type; the runtime scopes it to the declaring plugin. */
  readonly id: string;
  readonly cadence: EntityCheckCadence;
  /** Deliver the alerts it returns. Defaults to true. */
  readonly deliverAlerts?: boolean | undefined;
  /** Show the alerts it returns in the Inbox. Defaults to true. */
  readonly includeInInbox?: boolean | undefined;
  run(context: EntityCheckContext): Promise<EntityCheckResult>;
}

/** What a report reads with: the caller's view of the brain. */
export interface EntityAnalyticsReportContext {
  /**
   * Definition-typed reads at the caller's visibility. A public caller is a
   * site's visitor and sees only what is published.
   */
  readonly entities: EntityReader;
  readonly visibility: EntityVisibility;
}

/**
 * One `system_analytics` report: an aggregate the agent can ask for, with
 * the params it may pass. The tool shows the report and its params to the
 * model and validates params before `report` runs.
 */
export interface EntityAnalyticsReportDeclaration<
  TParams extends z.ZodObject = z.ZodObject,
> {
  readonly kind: "rizom-analytics-report";
  /** The id the caller names: kebab-case, durable and brain-wide. */
  readonly type: string;
  /** What the report answers, for the model choosing one. */
  readonly description: string;
  /** The report's params; `z.object({})` when it takes none. */
  readonly params: TParams;
  /** The lowest caller level it answers; omitted, every caller may ask. */
  readonly minVisibility?: UserPermissionLevel | undefined;
  report(
    params: z.output<TParams>,
    context: EntityAnalyticsReportContext,
  ): Promise<Record<string, unknown>>;
}

/** The identities a record may name: this brain's DID and its anchor's. */
export interface EntityAtprotoPublishConfig {
  readonly brainDid?: string | undefined;
  readonly anchorDid?: string | undefined;
}

/** What a projection builds one record from. */
export interface EntityAtprotoRecordInput<TEntity> {
  readonly entity: TEntity;
  readonly config: EntityAtprotoPublishConfig;
  /** The record's page on this brain's site, when the site gives it one. */
  readonly pageUrl?: string | undefined;
  readonly topics?: readonly string[] | undefined;
  /** True when the record is previewed rather than published. */
  readonly dryRun: boolean;
  /**
   * Definition-typed reads as the package, at every visibility, so a
   * projection can refuse to publish something that is not public.
   */
  readonly entities: EntityReader;
  /**
   * Store bytes on the PDS and return the blob naming them. A preview stores
   * nothing and returns a placeholder of the same type and size.
   */
  uploadBlob(input: {
    readonly data: Uint8Array;
    readonly mimeType: string;
  }): Promise<AtprotoBlobRef>;
}

/**
 * How a type's public records become AT Protocol records. The lexicon names
 * the collection; the runtime registers the projection for the type and
 * validates each record against the lexicon before it is written.
 */
export interface EntityAtprotoProjection<TEntity> {
  readonly lexicon: AtprotoLexicon;
  /** Whether the PDS also validates records against the lexicon. */
  readonly validate?: boolean | undefined;
  /**
   * Whether a public record is ready to publish, such as a post that is no
   * longer a draft. Without it, every public record is. It sees validated
   * records only: one that does not validate fails to build and is reported,
   * rather than withdrawn from the PDS as unpublishable.
   */
  isPublishable?(entity: TEntity): boolean;
  buildRecord(
    input: EntityAtprotoRecordInput<TEntity>,
  ): Promise<Record<string, unknown>>;
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
  /**
   * Durable jobs this type declares, keyed by local name. The runtime
   * registers each under the type's scope; a create route delegates to one
   * by that name.
   */
  readonly jobs?: Readonly<Record<string, AnyEntityJobDeclaration>> | undefined;
  /**
   * Prompt generation for this type, registered as its `{type}:generation`
   * job — the job `system_generate` queues after writing the `stub`.
   */
  readonly generation?:
    EntityGenerationDeclaration<z.ZodType, TMetadataSchema> | undefined;
  /**
   * The placeholder a queued generation starts from. Without one,
   * `system_generate` refuses the type.
   */
  readonly stub?:
    | ((input: { readonly id: string; readonly title: string }) => {
        readonly content: string;
        readonly metadata: EntityMetadataInput<TMetadataSchema>;
      })
    | undefined;
  /**
   * What this type writes from when the content pipeline schedules one and
   * nothing says what about. Requires `generation`.
   */
  readonly scheduledGeneration?:
    EntityScheduledGenerationDeclaration | undefined;
  /** How and when an agent should reach for this type, in plain text. */
  readonly instructions?: string | undefined;
  /** Grounding this type offers the agent before it answers. */
  readonly agentContext?: EntityAgentContextProvider | undefined;
  /** Eval handlers, keyed by handler id. */
  readonly evals?: EntityEvalDeclaration | undefined;
  /** This type's syndication feed, written into every site build. */
  readonly feed?:
    | EntityFeedDeclaration<EntityOf<EntityDefinition<TType, TMetadataSchema>>>
    | undefined;
  /**
   * Rules that derive entities of this type from many sources, or from
   * sources no single `defineProjection` names. Each rule writes this type
   * only. Rule ids are durable and brain-wide. The function form receives
   * the registered name of each template this type declares, for a rule
   * that generates through one.
   */
  readonly projectionRules?:
    | readonly ProjectionRule[]
    | ((context: {
        readonly template: (localName: string) => string;
      }) => readonly ProjectionRule[])
    | undefined;
  /**
   * Widgets this type shows on the Dashboard, each a `defineDashboardWidget`
   * bound to the loader that fills it, which reads at the caller's
   * visibility.
   */
  readonly dashboardWidgets?:
    | ((
        context: EntityDashboardBindingContext,
      ) => readonly EntityDashboardWidget[])
    | undefined;
  /** What this type puts in front of the operator in the Inbox. */
  readonly inbox?:
    | EntityInboxDeclaration<EntityDefinition<TType, TMetadataSchema>>
    | undefined;
  /** Checks the brain runs for this type on a schedule. */
  readonly checks?: readonly EntityCheckDeclaration[] | undefined;
  /** Reports this type adds to `system_analytics`. */
  readonly analyticsReports?:
    readonly EntityAnalyticsReportDeclaration[] | undefined;
  /** How this type is published through the brain's publish pipeline. */
  readonly publish?: EntityPublishDeclaration<TMetadataSchema> | undefined;
  /** Images the publish pipeline renders before a record goes out. */
  readonly publishAssets?: readonly EntityPublishAssetDeclaration[] | undefined;
  /** How this type's public records are published as AT Protocol records. */
  readonly atproto?:
    | EntityAtprotoProjection<
        EntityOf<EntityDefinition<TType, TMetadataSchema>>
      >
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
 * Definition-typed reads, each typed by the definition it names. Every
 * context that reads entities is given one, at that context's authority: a
 * data source sees what the build may show, a check reads as the package, an
 * Inbox detail reads as its actor.
 */
export interface EntityReader {
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
    entities: EntityReader,
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
  readonly entities: EntityReader;
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
  readonly entities: EntityReader;
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
        readonly metadata: EntityMetadataInput<TMetadataSchema>;
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
        readonly metadata: EntityMetadataInput<TMetadataSchema>;
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
      ): Promise<
        | EntityCreateResolution<TMetadataSchema>
        | EntityCreateAllocation<TMetadataSchema>
      >;
    };

/** A job this type declares, named locally, and the input it is given. */
export interface EntityCreateDelegation {
  readonly job: string;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * A create that finishes later: the runtime writes the placeholder (or finds
 * the existing entity), queues the declared job with that entity's id, and
 * reports `generating`. An allocation delegates to a job that generates, so
 * the runtime owns the entity's lifecycle — the write on success and the
 * failure marking on error. A bare `delegate` queues any declared job.
 */
export type EntityCreateAllocation<
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> =
  | {
      readonly create: {
        readonly id: string;
        readonly content: string;
        readonly metadata: EntityMetadataInput<TMetadataSchema>;
      };
      readonly delegate: EntityCreateDelegation;
      readonly attachment?: EntityCreateAttachment | undefined;
    }
  | {
      readonly existing: { readonly id: string };
      readonly delegate: EntityCreateDelegation;
      readonly attachment?: EntityCreateAttachment | undefined;
    }
  | { readonly delegate: EntityCreateDelegation };

/** How a job reports progress. */
export interface EntityJobProgress {
  report(update: {
    readonly progress: number;
    readonly total?: number | undefined;
    readonly message?: string | undefined;
  }): Promise<void>;
}

/** How a job announces what happened, to every subscriber. */
export interface EntityJobMessaging {
  publish(message: {
    readonly topic: string;
    readonly data: object;
  }): Promise<void>;
}

/**
 * What a declared job is given: its parsed input, definition-typed reads as
 * the package, messaging, progress and cancellation. Frozen.
 */
export interface EntityJobContext<TInput> {
  readonly input: TInput;
  readonly entities: EntityReader;
  readonly messaging: EntityJobMessaging;
  readonly progress: EntityJobProgress;
  readonly signal: AbortSignal;
}

/** One generation through a template this type declares. */
export interface EntityGenerationRequest {
  /** Local template name; the runtime resolves its scope. */
  readonly template: string;
  readonly prompt: string;
  readonly data?: Readonly<Record<string, unknown>> | undefined;
  readonly representedIdentity?: "brain" | "anchor" | "none" | undefined;
  /** Write in the brain's voice: the style guide governs voice and form. */
  readonly voice?: boolean | undefined;
}

export interface EntityGenerationAI {
  generate<TSchema extends z.ZodType>(
    request: EntityGenerationRequest,
    schema: TSchema,
  ): Promise<z.output<TSchema>>;
}

/**
 * What a generation is given: a job's context, the allocated entity it
 * fills (when there is one), and template-based generation.
 */
export interface EntityGenerationContext<
  TInput,
> extends EntityJobContext<TInput> {
  readonly entityId: string | undefined;
  readonly ai: EntityGenerationAI;
}

/**
 * Point the entity a generation came from at what it produced. The runtime
 * makes the write, entitled to both sides, after checking the target before
 * anything is saved.
 */
export type EntityGenerationLink = {
  readonly entityType: string;
  readonly entityId: string;
} & (
  | {
      /** A frontmatter field holding one id, such as a cover image. */
      readonly field: string;
    }
  | {
      /** A frontmatter list of `{ id }`, added to rather than replaced. */
      readonly list: string;
      /** Entries a re-render supersedes, removed while linking. */
      readonly replaces?: readonly string[] | undefined;
    }
);

/**
 * What a generation produced, or why it could not. Content, not a written
 * entity: the runtime persists it, fills an allocated entity, or marks it
 * failed.
 */
export type EntityGenerationResult<
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> =
  | {
      readonly success: true;
      readonly content: string;
      readonly metadata: EntityMetadataInput<TMetadataSchema>;
      /** The id when nothing was allocated; defaults to the slugified title. */
      readonly id?: string | undefined;
      /** Extra fields merged into the job's success result. */
      readonly resultExtras?: Readonly<Record<string, unknown>> | undefined;
      readonly linkInto?: EntityGenerationLink | undefined;
    }
  | { readonly success: false; readonly error: string };

/** A durable job that does its own work and returns its result. */
export interface EntityJobDeclaration<
  TInputSchema extends z.ZodType = z.ZodType,
> {
  readonly input: TInputSchema;
  handle(context: EntityJobContext<z.output<TInputSchema>>): Promise<unknown>;
}

/**
 * A durable job that generates an entity of this type. The runtime parses
 * the input, then persists what comes back — filling the allocated entity
 * when the job was given one — or marks that entity failed.
 */
export interface EntityGenerationDeclaration<
  TInputSchema extends z.ZodType = z.ZodType,
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> {
  readonly input: TInputSchema;
  generate(
    context: EntityGenerationContext<z.output<TInputSchema>>,
  ): Promise<EntityGenerationResult<TMetadataSchema>>;
}

export type AnyEntityJobDeclaration =
  EntityJobDeclaration | EntityGenerationDeclaration;

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

/**
 * Grounding for the agent's next turn. The request is what the agent was
 * asked; reads are scoped to what the asker may see, so a provider cannot
 * surface restricted records into a public conversation.
 */
export type EntityAgentContextProvider = (context: {
  readonly request: AgentContextRequest;
  readonly entities: EntityReader;
}) => Promise<readonly AgentContextItem[]>;

/**
 * Fixture control, for evals only: plant the entities an eval measures
 * against, wait for their embeddings, and remove what was planted plus what
 * this type stores, so one run cannot contaminate the next.
 */
export interface EntityEvalFixtures {
  seed(entity: {
    readonly id: string;
    readonly entityType: string;
    readonly content: string;
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
    readonly visibility?: EntityVisibility | undefined;
  }): Promise<void>;
  /** Clears this type's records up to `visibilityScope` (default public), and the seeded ones. */
  reset(options?: {
    readonly visibilityScope?: EntityVisibility | undefined;
  }): Promise<void>;
  /** Wait for queued embeddings before measuring semantic matches (60s bound). */
  settleEmbeddings(): Promise<void>;
}

/** What an eval handler is given: generation, reads as the package, fixtures. */
export interface EntityEvalContext {
  readonly ai: EntityGenerationAI;
  readonly entities: EntityReader;
  readonly fixtures: EntityEvalFixtures;
}

export type EntityEvalDeclaration = Readonly<
  Record<
    string,
    (input: unknown, context: EntityEvalContext) => Promise<unknown>
  >
>;
