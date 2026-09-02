import type { BaseEntity, ProjectionSourceRole } from "@brains/entity-service";
import type { EntityActionPolicyRule, Template } from "@brains/templates";
import type { AnchorProfile } from "../contracts/identity";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type { IEntityAINamespace } from "./ai-types";
import type { LoggerContract } from "@brains/utils/logger";
import type {
  EntityConversationReader,
  JobEntityAccess,
  JobHandlerContext,
  JobMessagePublisher,
} from "../job/job-context-contract";
import type { Conversation } from "../contracts/conversations";
export type {
  EntityConversationBatch,
  EntityConversationReader,
} from "../job/job-context-contract";
import type {
  AtprotoBrainCardConflictPayload,
  AtprotoBrainCardDiscoveredPayload,
  AtprotoBrainCardUnavailablePayload,
  AtprotoProjection,
} from "@brains/atproto-contracts";
import type {
  RecurringCheckCadence,
  RecurringCheckResult,
} from "@brains/recurring-checks";
import type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
import type {
  InboxActor,
  InboxFacetDefinition,
  InboxItem,
  InboxItemDetail,
} from "../inbox-registry";
import type { FeedItem } from "@brains/site-composition";
import type {
  AgentContextItem,
  AgentContextRequest,
  PublishProvider,
} from "@brains/contracts";
import type { AttachmentProvider } from "../service/attachment-registry";
import type { IPermissionsNamespace } from "../public/types";
import type {
  ProjectionRule,
  ProjectionWaveInput,
  ProjectionWriteIntent,
} from "./projection-rule";
import type { AnyDataSourceDeclaration } from "../public/entity-data-source";
import type { AnyDashboardWidgetDefinition } from "../operator/operator-definition-contract";
import type { OperatorCaller } from "../operator/operator-context-contract";
import type {
  CreateInput,
  CreateResultAttachment,
  ProjectSemanticSpaceRequest,
  SemanticSpaceProjection,
} from "@brains/entity-service";
import type {
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
} from "../service/upload-registry";
import type { z } from "@brains/utils/zod";

export type {
  EntityOf,
  EntityVisibility,
  EntityWriteInput,
} from "./entity-shape";
// The shape of a link a create hands back. A package that builds one needs
// to name what it built.
export type { CreateResultAttachment } from "@brains/entity-service";
import type {
  EntityOf,
  EntityVisibility,
  EntityWriteInput,
} from "./entity-shape";
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
  /**
   * Partial metadata, because not every type keeps all of its in the file.
   * A document is a data URL whose filename and media type arrive in a
   * sidecar, so a codec that reads one back can only fill in half — the
   * runtime never validated this half anyway, and directory-sync merges it
   * with the other before anything is written.
   */
  decode(input: {
    readonly content: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
  }): EntityMarkdownDocument<Partial<z.input<TMetadataSchema>>>;
  encode(
    input: EntityMarkdownDocument<z.output<TMetadataSchema>>,
  ): EncodedEntityMarkdown;
}

/**
 * Declarative subset of EntityTypeConfig an author may set. Omitted
 * fields keep the runtime defaults (`embeddable` and `projectionSource`
 * both default to true), so this only needs to carry deliberate opt-outs
 * such as system-configuration types that must stay out of search
 * embeddings and out of projection sourcing.
 */
export interface EntityDefinitionConfig {
  // Bare optionals, not `| undefined` unions: the repo runs
  // exactOptionalPropertyTypes, and these must stay assignable to
  // EntityTypeConfig, which declares them the same way.
  readonly weight?: number;
  readonly embeddable?: boolean;
  readonly projectionSource?: boolean;
  readonly projectionSourceRole?: ProjectionSourceRole;
  /** Which statuses count as publishable for this type. */
  readonly publish?: { publishStatuses: string[] };
}

/**
 * Lifecycle moments a seed may attach to. Named rather than raw channel
 * strings so the public surface does not leak internal channel names.
 *
 * `content-sync-completed` fires once the initial content sync has
 * finished, which is the only safe point to write a default: seeding
 * earlier would race synced content and could resurrect something the
 * author deleted upstream.
 */
export type EntitySeedTrigger = "content-sync-completed";

/**
 * Declares a default entity the brain should hold even before anyone
 * edits one — a singleton like a house style guide.
 *
 * Seeding is create-if-absent: an existing entity with this id is never
 * overwritten, so a seed cannot clobber authored content.
 */
export interface EntitySeedDefinition<
  TMetadataSchema extends EntityMetadataSchema,
> {
  readonly on: EntitySeedTrigger;
  readonly id: string;
  /** Lazy so the default is only built when it is actually needed. */
  readonly content: () => string;
  readonly metadata?: z.input<TMetadataSchema>;
}

export interface EntityDefinition<
  TType extends string = string,
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> {
  readonly kind: "rizom-entity";
  readonly type: TType;
  readonly purpose: string;
  readonly metadata: TMetadataSchema;
  /**
   * Normalise stored metadata before the schema sees it.
   *
   * Records written before a shape changed still have to parse, and the
   * schema every read goes through is the only place that can migrate them.
   * Declared separately rather than folded into `metadata` so the schema
   * stays an object shape — which is what the adapter's frontmatter parsing
   * and `EntityOf` are built on.
   *
   * Returns the input untouched when there is nothing to migrate. Named
   * consumer: `@brains/conversation-memory`, whose actor references were
   * once a bare id.
   */
  readonly metadataFrom?: ((stored: unknown) => unknown) | undefined;
  readonly markdown?: EntityMarkdownCodec<TMetadataSchema> | undefined;
  readonly config?: EntityDefinitionConfig | undefined;
  /**
   * Who may do what to this type, when the default is not right.
   *
   * Some types are the brain's own record rather than anyone's content: a
   * conversation summary is derived, and a user who could rewrite one could
   * rewrite what the brain remembers happening. Such a type refuses every
   * action with `"never"`.
   *
   * Omitted, the type follows the platform baseline.
   */
  readonly actions?: EntityActionPolicyRule | undefined;
  readonly seed?: EntitySeedDefinition<TMetadataSchema> | undefined;
  /** Keyed by local template name; the runtime scopes them to the plugin. */
  readonly templates?: Record<string, Template> | undefined;
  /** Declared data sources; the runtime scopes their ids to the package. */
  readonly dataSources?: readonly AnyDataSourceDeclaration[] | undefined;
  /**
   * Source-derived publish artifacts for this entity type. The runtime owns
   * registration and teardown, so a package never holds unregister handles
   * of its own.
   */
  readonly attachments?: readonly EntityAttachmentDeclaration[] | undefined;
  /**
   * Content generation for this entity type. The runtime registers it as
   * the `{entityType}:generation` job and validates input against the
   * declared schema before calling `handle`.
   */
  readonly generation?: EntityGenerationDeclaration | undefined;
  /**
   * The placeholder a queued generation starts from.
   *
   * `system_generate` persists one before enqueueing so the caller has an
   * entity to look at while the work runs, and refuses a type that has none.
   *
   * Content as well as metadata, because they are not the same thing for
   * every type: a codec that keeps fields in the content's frontmatter
   * rather than in metadata still needs them present, or the placeholder
   * cannot be read back.
   */
  readonly stub?:
    | ((input: { readonly id: string; readonly title: string }) => {
        readonly content: string;
        readonly metadata: Record<string, unknown>;
      })
    | undefined;
  /**
   * Where this entity type gets its material when a schedule asks for one
   * and no prompt says what to write about.
   */
  readonly scheduledGeneration?:
    EntityScheduledGenerationDeclaration | undefined;
  /**
   * Projection rules for an entity derived from many source types rather
   * than from one named source. `defineProjection` pairs a single source
   * definition with a single target and cannot express that.
   */
  readonly projectionRules?:
    | readonly ProjectionRule[]
    // A function when a rule has to name a template: only the runtime knows
    // the scope templates register under, and a rule that spells the prefix
    // itself fails as "Template not found" at derive time.
    | ((context: {
        readonly template: (localName: string) => string;
      }) => readonly ProjectionRule[])
    | undefined;
  /**
   * AT Protocol projection for this entity type. The runtime registers it
   * with the shared registry and releases it on shutdown.
   */
  readonly atproto?: AtprotoProjection | undefined;
  /** Eval handlers, keyed by handler id. */
  readonly evals?: EntityEvalDeclaration | undefined;
  /**
   * Insights this entity type contributes, keyed by insight id.
   *
   * An insight is a static fact about what a package can report, so it is
   * declared rather than registered: the runtime owns registration and the
   * package never names the insights namespace.
   */
  readonly insights?: EntityInsightDeclaration | undefined;
  /**
   * Dashboard widgets this entity type contributes.
   *
   * Four packages subscribed to the plugins-registered lifecycle event to do
   * exactly this one thing. That is not a messaging need — it is waiting for
   * a hook to announce a static fact, so the runtime owns the wait.
   */
  readonly dashboardWidgets?:
    readonly EntityDashboardWidgetDeclaration[] | undefined;
  /**
   * Something this type has to check on a schedule — an agent card goes
   * stale, a link rots. A fact about the type rather than a subscription it
   * sets up, so the runtime owns registration, the cadence vocabulary, and
   * scoping the id so two packages can both have a "freshness" check.
   */
  readonly checks?: readonly EntityCheckDeclaration[] | undefined;
  /** What this type contributes to the shared inbox. */
  readonly inbox?: EntityInboxDeclaration | undefined;
  /** What a brain card discovered on the network means to this type. */
  readonly atprotoDiscovery?: EntityAtprotoDiscovery | undefined;
  /** Durable job handlers, keyed by job type. */
  readonly jobs?: Record<string, AnyEntityJobDeclaration> | undefined;
  /**
   * Grounding this entity type offers the agent before it answers. The
   * runtime subscribes, parses, scopes the reads, and builds the response.
   */
  readonly agentContext?: EntityAgentContextProvider | undefined;
  /**
   * Agent instructions for this entity type — how and when an agent
   * should reach for it. Plain text, since the agent reads it directly.
   */
  readonly instructions?: string | undefined;
  /**
   * How `system_create` behaves for this entity type, routed by the shape
   * of the create input.
   */
  readonly create?: EntityCreateRouting | undefined;
  /**
   * Publish participation. The runtime announces the provider to the
   * publish pipeline once that pipeline is listening, which is the only
   * live part of the publish protocol an entity package takes part in.
   */
  readonly publish?: EntityPublishDeclaration | undefined;
  /**
   * Media the publish pipeline must have before this entity type goes out —
   * an OG image, say. The pipeline owns generation and the readiness check;
   * this only says what is needed and where the result is recorded.
   */
  readonly publishAssets?: readonly EntityPublishAssetDeclaration[] | undefined;
  /**
   * Syndication. The entity says how one of its entities becomes a feed
   * item; the site build decides which entities qualify, where the file
   * goes, and how a slug becomes a URL.
   */
  readonly feed?:
    | EntityFeedDeclaration<EntityOf<EntityDefinition<TType, TMetadataSchema>>>
    | undefined;
}

/**
 * How this entity type contributes to a syndication feed.
 *
 * `toItem` returns null for an entity that should not appear — malformed,
 * or missing what a reader needs. It does not decide whether unpublished
 * entities appear: that is the build's call, since only it knows whether
 * this is a preview.
 */
export interface EntityFeedDeclaration<TEntity> {
  /** Path the feed is written to, relative to the build output. */
  readonly path: string;
  /** Route prefix an item hangs off, e.g. "posts". */
  readonly routePrefix: string;
  toItem(entity: TEntity): FeedItem | null;
}

/**
 * A publish artifact this entity type needs, and where its id is recorded.
 *
 * `entityType` is absent deliberately: the entity declaring this is the
 * entity it applies to, so restating it would let the two disagree.
 */
export interface EntityPublishAssetDeclaration {
  /** Attachment the asset is resolved from, e.g. "og-image". */
  readonly attachmentType: string;
  readonly mediaEntityType: "image" | "document";
  /** Where the produced media id is recorded on the entity. */
  readonly targetEntityField?:
    | string
    | { readonly location: "metadata" | "frontmatter"; readonly field: string }
    | undefined;
  /** Conditions under which the asset becomes required. */
  readonly requiredWhen?:
    | {
        readonly status?: string | undefined;
        readonly visibility?: string | undefined;
      }
    | undefined;
  readonly autoGenerate?: boolean | undefined;
  readonly requiredForPublish?: boolean | undefined;
  /** Job that produces it when missing. */
  readonly jobType?: string | undefined;
}

/**
 * A publish provider plus where its result is recorded.
 *
 * The pipeline owns everything else: it prepares content, resolves
 * attachments and media, calls the provider, and records publish state.
 * A package supplies the provider and nothing more.
 */
export interface EntityPublishDeclaration {
  readonly provider: PublishProvider;
  /** Metadata/frontmatter field for the provider result id. */
  readonly resultIdField?: string | undefined;
  /** Metadata/frontmatter field for the publish timestamp. */
  readonly timestampField?: string | undefined;
}

/**
 * What a create route decided: write this, change that, or refuse.
 *
 * Content rather than a completed write, for the same reason a generation
 * hands back content — the runtime performs it and reports what happened,
 * so a package cannot claim it created something it did not.
 */
export type EntityCreateResolution =
  | {
      readonly create: {
        readonly id: string;
        readonly content: string;
        readonly metadata: Record<string, unknown>;
      };
      readonly attachment?: EntityCreateAttachment | undefined;
    }
  | {
      readonly update: {
        readonly id: string;
        readonly content: string;
        readonly metadata: Record<string, unknown>;
      };
    }
  | { readonly refuse: string };

/**
 * A create that allocates now and finishes later.
 *
 * An import has to do both: hand the caller a real, deduplicated id it can
 * look at straight away, and give the slow part — reading a file, calling a
 * model — to a job. `delegate` alone enqueues without allocating anything;
 * `create` alone reports the work as finished when it has not started. The
 * runtime writes the placeholder, enqueues the job with the allocated id,
 * and reports `generating` rather than `created`.
 */
/**
 * What a create route may attach to its result.
 *
 * A function of the entity the runtime wrote, not a value: dedup can change
 * the id the route proposed, and an attachment built from the proposed one
 * would point at nothing.
 */
export type EntityCreateAttachment = (written: {
  readonly entityId: string;
}) => CreateResultAttachment;

export interface EntityCreateDelegation {
  /** A job this package declares, named locally. */
  readonly job: string;
  /** Merged over `{ entityId }`, which the runtime always supplies. */
  readonly input?: Record<string, unknown> | undefined;
}

export type EntityCreateAllocation =
  | {
      readonly create: {
        readonly id: string;
        readonly content: string;
        readonly metadata: Record<string, unknown>;
      };
      readonly delegate: EntityCreateDelegation;
      /**
       * A link to the artifact, handed back before the job that fills it in
       * has run. The id is already allocated, so the URL is already known —
       * and building it is the package's business, since only it knows its
       * own media type and route.
       */
      readonly attachment?: EntityCreateAttachment | undefined;
    }
  /**
   * Delegate against an entity the route already found.
   *
   * Both answers are right somewhere: importing the same file twice makes
   * two notes, rendering the same deck twice reuses one document. The route
   * is what knows which, so it says — rather than the runtime guessing from
   * an id collision, which would allocate a second entity beside the first.
   */
  | {
      readonly existing: { readonly id: string };
      readonly delegate: EntityCreateDelegation;
      readonly attachment?: EntityCreateAttachment | undefined;
    };

/** What a create route is given to decide with. */
export interface EntityCreateContext {
  readonly input: CreateInput;
  readonly entities: JobEntityAccess;
  readonly logger: LoggerContract;
  /**
   * The upload the request refers to, when it refers to one. A route that
   * refuses a file it cannot read has to look at it first — note declines
   * anything that is not text, JSON, or PDF before allocating anything.
   */
  readonly uploads: EntityCreateUploadReader;
}

export interface EntityCreateUploadReader {
  read(uploadId: string): Promise<ResolvedRuntimeUpload>;
  readRecord(uploadId: string): Promise<RuntimeUploadRecord>;
}

/**
 * What to do with a create request of a given input shape: hand it to a
 * declared job, decide inline, or refuse it with a message.
 *
 * `delegate` and `reject` are data rather than a callback, so the runtime
 * enqueues and reports and a package cannot misreport what happened.
 * `resolve` keeps that guarantee for creates that finish immediately — a
 * wish deduplicates against what exists and either raises a count or starts
 * a new one — by returning what should be written rather than writing it.
 */
export type EntityCreateRoute =
  | { readonly delegate: string }
  | { readonly reject: string }
  | {
      /**
       * Media types this route claims from the upload endpoint.
       *
       * An uploaded file reaches a type two ways — `system_create` with an
       * upload ref, and the endpoint routing by media type — and they are
       * the same decision. Declaring them here registers both, instead of
       * a package registering a second handler that calls its own create
       * logic back.
       */
      readonly mediaTypes?: readonly string[] | undefined;
      resolve(
        context: EntityCreateContext,
      ): Promise<EntityCreateResolution | EntityCreateAllocation>;
    };

/**
 * Create inputs are already discriminated by how the caller expressed
 * what they want, so routing keys off that rather than an author-supplied
 * predicate:
 *
 * - `fromPrompt`: the caller described what they want in words.
 * - `fromUpload`: the caller referenced an uploaded file.
 * - `fromContent`: the caller supplied the content outright.
 *
 * An unlisted shape proceeds to ordinary creation.
 */
export interface EntityCreateRouting {
  readonly fromPrompt?: EntityCreateRoute | undefined;
  readonly fromUpload?: EntityCreateRoute | undefined;
  /**
   * Derived from another entity's attachment — rendering a deck as a PDF,
   * say. A distinct route from `fromUpload` because it is a distinct
   * request: nothing has been uploaded, and the source is an entity the
   * brain already holds.
   */
  readonly fromAttachment?: EntityCreateRoute | undefined;
  readonly fromContent?: EntityCreateRoute | undefined;
}

/**
 * What a generation handler is given: AI generation, entity access, and a
 * logger. Every member is a narrow contract rather than the plugin
 * context, so nothing here drags a runtime service into the published
 * declarations.
 */
export interface EntityGenerationContext {
  readonly ai: IEntityAINamespace;
  readonly logger: LoggerContract;
  readonly entities: JobEntityAccess;
  readonly conversations: EntityConversationReader;
}

/**
 * Conversation lookup, narrowed to the read entity packages actually do:
 * resolving where a captured item came from. The full namespace also
 * lists and searches, which no entity needs.
 */
/**
 * What a declared eval handler is given: everything generation gets, plus
 * the one thing only an eval needs.
 *
 * An eval that seeds fixtures and measures the result has to start from a
 * known state — otherwise one run contaminates the next. That is deletion,
 * which no other declaration slot is granted and which the general job
 * context deliberately omits. Narrowed to the declaring entity type: an
 * eval resets what it seeded, not what other packages store.
 */
/**
 * Fixture control, available to evals and nothing else.
 *
 * Seeding reaches past the write scope every other slot is held to, because
 * an extraction eval has to plant the source entities it extracts from and
 * those belong to other packages. Reset clears exactly what was seeded plus
 * what the package itself stores, so one eval run cannot contaminate the
 * next and neither can touch anything a fixture did not create.
 */
export interface EntityEvalFixtures {
  seed(entity: {
    readonly id: string;
    readonly entityType: string;
    readonly content: string;
    readonly metadata?: Record<string, unknown> | undefined;
  }): Promise<void>;
  reset(): Promise<void>;
}

export interface EntityEvalContext extends EntityGenerationContext {
  readonly fixtures: EntityEvalFixtures;
  /**
   * The scoped name a template this package declared is registered under —
   * the same resolver a job handler gets, for the same reason. An eval that
   * measures generation has to name the template generation uses.
   */
  template(localName: string): string;
  /**
   * Run one of this package's own projection rules against current entities
   * and hand back what it would write.
   *
   * Select and derive only — waves, memoization and persistence are
   * orchestration, not the thing an eval measures. Without this, a package
   * that wants to measure extraction quality has to keep a second copy of
   * its pipeline that an eval can call, and the copy is what rots.
   */
  runProjectionRule(
    rule: ProjectionRule,
    /**
     * The sources to measure against, for a rule that derives only from what
     * changed. A rule that reads the corpus needs none; one woken by a
     * conversation selects nothing without them and the eval measures an
     * empty run instead of the derivation.
     */
    options?: { readonly inputs?: readonly ProjectionWaveInput[] },
  ): Promise<readonly ProjectionWriteIntent[]>;
}

/**
 * Eval handlers for this entity type, keyed by handler id. The runtime
 * registers each with the eval namespace.
 */
export type EntityEvalDeclaration = Record<
  string,
  (input: unknown, context: EntityEvalContext) => Promise<unknown>
>;

/**
 * What this type puts in front of a person to act on — an agent sighting to
 * vouch for, an email to file.
 *
 * A fact about the type rather than a registration it performs, so the
 * runtime holds the registry and a package never does.
 */
export interface EntityInboxDeclaration {
  readonly sourceId: string;
  readonly displayName: string;
  readonly facets?: InboxFacetDefinition[] | undefined;
  list(context: EntityReactionContext): Promise<InboxItem[]>;
  resolveDetail?(
    context: EntityReactionContext,
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail>;
  act(
    context: EntityReactionContext,
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void>;
}

/**
 * What a package gets when the runtime hands it something that happened.
 *
 * Entity access to record it, a publisher to say what it made of it, and a
 * logger. Deliberately not a plugin context: reacting to an event is not a
 * licence to reach the whole runtime.
 */
export interface EntityReactionContext {
  readonly entities: JobEntityAccess;
  readonly messaging: JobMessagePublisher;
  /**
   * Bookkeeping that is not an entity.
   *
   * "I have already told someone about this peer" has no content, nobody
   * browses it, and it should not survive a rebuild of what it is about.
   * Scoped by namespace and validated by a schema, so one package's notes
   * cannot be read or corrupted by another's.
   */
  readonly state: <TValue>(
    options: RuntimeStateScopeOptions<TValue>,
  ) => IRuntimeStateStore<TValue>;
  /**
   * Whether this actor may do a thing to a type.
   *
   * An inbox item that offers "approve" has to refuse someone who may not
   * approve, and the actor is only known when they act. Throws rather than
   * returning false, so a caller cannot forget to check the answer.
   */
  readonly permissions: IPermissionsNamespace;
  /**
   * Where the running auth implementation is published. A tool that grants
   * or revokes trust acts on auth rather than on entities. Named consumer:
   * @brains/agent-discovery.
   */
  readonly auth: IAuthRegistry;
  /**
   * The brain's own domain, when it has one.
   *
   * Needed to recognise itself: a directory scan that does not know its own
   * domain introduces the brain to itself as a peer.
   */
  readonly domain: string | undefined;
  readonly logger: LoggerContract;
}

/**
 * Turn a record the brain found on the network into an entity of this type.
 *
 * The mirror of `atproto`: that slot publishes an entity as a record, this
 * one reads one back. `@brains/atproto` crawls and says what it found; a
 * type that represents network peers is what decides what a found card
 * means. The channel, the parse and the reply stay the runtime's.
 *
 * One consumer, deliberately — there is one type that represents other
 * brains, and a second would be a second brain.
 */
export interface EntityAtprotoDiscovery {
  onCardDiscovered(
    context: EntityReactionContext,
    card: AtprotoBrainCardDiscoveredPayload,
  ): Promise<unknown>;
  /** The peer's card stopped resolving — it moved, or it is gone. */
  onCardUnavailable?(
    context: EntityReactionContext,
    card: AtprotoBrainCardUnavailablePayload,
  ): Promise<unknown>;
  /**
   * Two repos claim the same domain.
   *
   * Not a discovery: nothing is written, because which of them is the real
   * peer is not something the directory can decide. It is raised for a
   * person to settle.
   */
  onCardConflict?(
    context: EntityReactionContext,
    conflict: AtprotoBrainCardConflictPayload,
  ): Promise<unknown>;
}

/** A scheduled check an entity type declares. */
export interface EntityCheckDeclaration {
  /** Local to the package; the runtime scopes it. */
  readonly id: string;
  readonly cadence: RecurringCheckCadence;
  /** Deliver returned alerts. Defaults to true. */
  readonly deliverAlerts?: boolean | undefined;
  /** Project returned alerts into the shared inbox. Defaults to true. */
  readonly includeInInbox?: boolean | undefined;
  run(
    context: EntityReactionContext & {
      readonly conversations: EntityConversationReader;
      readonly signal: AbortSignal;
    },
  ): Promise<RecurringCheckResult>;
}

/**
 * A durable job this entity handles: an input schema plus one function.
 * The runtime parses job input with the schema before `handle` runs, so a
 * malformed job never reaches the author's code.
 */
export interface EntityJobDeclaration<
  TInputSchema extends z.ZodType = z.ZodType,
> {
  readonly input: TInputSchema;
  handle(args: JobHandlerContext<z.output<TInputSchema>>): Promise<unknown>;
}

/**
 * A job that fills in an entity the runtime already allocated.
 *
 * Declared with `generate` rather than `handle` because the two make
 * different promises: `handle` returns whatever it likes and owns its own
 * consequences, while `generate` returns what it produced and hands the
 * runtime the entity's lifecycle — the write on success, and the failure
 * marking on error. Without that, a job that throws leaves the caller
 * looking at an entity stuck in "generating" with nobody left to say why.
 *
 * Reached through a create route's `delegate`, which is what allocated the
 * entity and passed its id.
 */
export interface EntityGenerationJobDeclaration<
  TInputSchema extends z.ZodType = z.ZodType,
> {
  readonly input: TInputSchema;
  generate(
    args: JobHandlerContext<z.output<TInputSchema>> & {
      readonly entityId: string | undefined;
    },
  ): Promise<EntityGenerationResult>;
}

export type AnyEntityJobDeclaration =
  EntityJobDeclaration | EntityGenerationJobDeclaration;

/**
 * What a generation produced, or why it could not.
 *
 * Content rather than a written entity: the lifecycle around a generation —
 * allocating the entity, marking it generating, persisting the result,
 * marking it failed — belongs to the runtime. A handler that writes its own
 * entity cannot take part in that lifecycle, which is how a pre-allocated
 * stub came to be ignored and left generating forever.
 */
export type EntityGenerationResult =
  | {
      readonly success: true;
      readonly content: string;
      readonly metadata: Record<string, unknown>;
      /**
       * The id to store this under when nothing was pre-allocated. Entity
       * ids are user-visible — directory sync names files after them — so a
       * package that wants a readable one says so. Defaults to the title,
       * slugified.
       */
      readonly id?: string | undefined;
      /** Extra fields merged into the job's success result, e.g. a slug. */
      readonly resultExtras?: Record<string, unknown> | undefined;
      readonly linkInto?: EntityGenerationLink | undefined;
    }
  | { readonly success: false; readonly error: string };

/**
 * What this entity type contributes to grounding the agent's next turn.
 *
 * Two packages did this by subscribing to a named channel, parsing the
 * request, and wrapping the answer in an envelope. None of that is theirs —
 * the channel, the parse and the envelope are the runtime's, and a package
 * only knows what it knows about the conversation.
 *
 * Entity reads are already scoped to what the asker may see, so a provider
 * cannot surface restricted memory into a public channel by forgetting to
 * pass a scope.
 */
export type EntityAgentContextProvider = (args: {
  readonly request: AgentContextRequest;
  readonly entities: JobEntityAccess;
  readonly conversations: EntityConversationReader;
  readonly logger: LoggerContract;
}) => Promise<readonly AgentContextItem[]>;

/**
 * Point the entity a generation was derived from at what came out.
 *
 * Rendering a deck as a PDF has to leave the deck pointing at the PDF, and
 * that write belongs to neither package alone: the document package may not
 * write a deck, and the deck knows nothing about documents. So the
 * generation says what to link and which stale links to drop, and the
 * runtime — entitled to both sides — does the write.
 */
export type EntityGenerationLink = {
  readonly entityType: string;
  readonly entityId: string;
} & (
  | {
      /**
       * A frontmatter field holding one id — a cover image, an OG image.
       * Set outright, because a field that holds one thing has no previous
       * entry to supersede.
       */
      readonly field: string;
    }
  | {
      /**
       * A frontmatter list of `{ id }` — the PDFs rendered from a post.
       * Added to rather than replaced, because a post may hold several.
       */
      readonly list: string;
      /**
       * Entries to remove while linking. The package knows which of its own
       * artifacts a re-render supersedes; the runtime only knows how to
       * write the list.
       */
      readonly replaces?: readonly string[] | undefined;
    }
);

/**
 * Content generation for an entity type, registered by the runtime as the
 * `{entityType}:generation` job.
 *
 * Shares a job's context — AI, entity reads, progress — but not its return
 * contract: it hands back content and the runtime persists it. When the job
 * input carries an `entityId`, that entity is filled in rather than a new
 * one created; otherwise the id is derived from the returned title.
 */
export interface EntityGenerationDeclaration<
  TInputSchema extends z.ZodType = z.ZodType,
> {
  readonly input: TInputSchema;
  generate(
    args: JobHandlerContext<z.output<TInputSchema>> & {
      /** The pre-allocated entity being filled in, when there is one. */
      readonly entityId: string | undefined;
    },
  ): Promise<EntityGenerationResult>;
}

/**
 * How a scheduled generation finds something to write from.
 *
 * The generation job itself takes a prompt or explicit sources; this covers
 * the case where a scheduler asks for an entity of this type and supplies
 * neither. The runtime lists the sources, picks according to `mode`, and
 * enqueues `{entityType}:generation` — a package that declares this neither
 * subscribes to the schedule nor enqueues its own job.
 *
 * `from.entityType` names a type, not a package: an entity that summarises
 * long-form writing depends on there being long-form writing, which is a
 * fact about the content, not an import.
 */
export interface EntityScheduledGenerationDeclaration {
  readonly from: {
    readonly entityType: string;
    /** Metadata status a source must have to be written from. */
    readonly status?: string | undefined;
    readonly limit: number;
  };
  /**
   * `each` writes from one source at a time, skipping sources this type has
   * already been derived from. `batch` writes from all of them at once.
   */
  readonly mode: "each" | "batch";
}

/**
 * What an insight is given: reads scoped to the declaring package, and the
 * visibility the caller is entitled to see.
 */
export interface EntityInsightContext {
  readonly entities: JobEntityAccess;
  readonly visibilityScope: EntityVisibility;
}

/** Insight handlers, keyed by insight id. */
export type EntityInsightDeclaration = Record<
  string,
  (context: EntityInsightContext) => Promise<Record<string, unknown>>
>;

/**
 * A dashboard widget an entity type contributes, with the reader that fills
 * it. Type-erased so a definition can hold widgets over different data
 * shapes; `defineEntityDashboardWidget` checks the pairing where it is
 * written.
 */
/**
 * What a widget is given to build its data.
 *
 * Wider than a job's context on one axis, deliberately. A job is handed one
 * conversation and does something with it; a widget reports on the state of
 * the brain, and "how many conversations have no summary" cannot be answered
 * without surveying them. Two shapes because they are two questions — a job
 * that could list every conversation would be reading well past what it was
 * asked to do.
 */
export interface EntityDashboardWidgetContext {
  readonly entities: JobEntityAccess;
  /** Every conversation, because coverage is a question about all of them. */
  readonly conversations: EntityConversationSurvey;
  /** The brain's configured conversation spaces. */
  readonly spaces: readonly string[];
  /** Where this type's entities sit relative to each other. */
  readonly semantic: EntitySemanticReader;
  readonly caller: OperatorCaller | null;
  readonly signal: AbortSignal;
}

/**
 * Reading across conversations as well as into one.
 *
 * A widget that surveys will want to read what it found — coverage lists
 * every conversation, then reads each to decide whether its summary is
 * stale. So this extends the job's reader rather than sitting beside it.
 */
/**
 * Where entities sit relative to each other.
 *
 * "Where do the agents I own sit relative to us" is a read, bounded to the
 * declaring type with an origin and a distance. The full namespace would let
 * a package project every entity in the brain — a map of the brain rather
 * than of anything the package owns, which is how the knowledge map ended up
 * living in `topics`.
 */
export interface EntitySemanticReader {
  project(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection>;
}

export interface EntityConversationSurvey extends EntityConversationReader {
  list(options?: {
    readonly limit?: number | undefined;
    readonly interfaceType?: string | undefined;
    readonly channelId?: string | undefined;
  }): Promise<Conversation[]>;
}

export interface EntityDashboardWidgetDeclaration {
  readonly definition: AnyDashboardWidgetDefinition;
  load(context: EntityDashboardWidgetContext): Promise<unknown>;
}

/**
 * An attachment provider, declared.
 *
 * The provider is a factory rather than an instance because it needs the
 * media context — theme CSS, identity, domain, and entity reads — which
 * only exists once the plugin is registered.
 */
export interface EntityAttachmentDeclaration {
  /** Semantic attachment type, e.g. "printable" or "og-image". */
  readonly type: string;
  readonly provider: (context: MediaAttachmentContext) => AttachmentProvider;
}

/**
 * What an attachment provider is built with: the four members media
 * providers actually use, named structurally so this stays publishable.
 * `EntityPluginContext` satisfies it.
 */
export interface MediaAttachmentContext {
  readonly domain: string | undefined;
  readonly themeCSS: string;
  readonly identity: {
    getProfile(): AnchorProfile;
  };
  readonly entityService: {
    getEntity<T extends BaseEntity>(request: {
      entityType: string;
      id: string;
    }): Promise<T | null>;
    /**
     * Present because a media provider may need a singleton it cannot name by
     * id — decks resolves the site's theme mode this way before rendering a
     * carousel.
     */
    listEntities<T extends BaseEntity>(request: {
      entityType: string;
      options?: { limit?: number };
    }): Promise<T[]>;
  };
}

export type AnyEntityDefinition = EntityDefinition<
  string,
  EntityMetadataSchema
>;

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
