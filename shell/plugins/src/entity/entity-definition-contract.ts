import type { BaseEntity, ProjectionSourceRole } from "@brains/entity-service";
import type { Template } from "@brains/templates";
import type { AnchorProfile } from "../contracts/identity";
import type { IEntityAINamespace } from "./ai-types";
import type { LoggerContract } from "@brains/utils/logger";
import type {
  JobEntityAccess,
  JobHandlerContext,
} from "../job/job-context-contract";
import type { AtprotoProjection } from "@brains/atproto-contracts";
import type { PublishProvider } from "@brains/contracts";
import type { AttachmentProvider } from "../service/attachment-registry";
import type { ProjectionRule } from "./projection-rule";
import type { AnyDataSourceDeclaration } from "../public/entity-data-source";
import type { z } from "@brains/utils/zod";

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
  readonly markdown?: EntityMarkdownCodec<TMetadataSchema> | undefined;
  readonly config?: EntityDefinitionConfig | undefined;
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
   * Projection rules for an entity derived from many source types rather
   * than from one named source. `defineProjection` pairs a single source
   * definition with a single target and cannot express that.
   */
  readonly projectionRules?: readonly ProjectionRule[] | undefined;
  /**
   * AT Protocol projection for this entity type. The runtime registers it
   * with the shared registry and releases it on shutdown.
   */
  readonly atproto?: AtprotoProjection | undefined;
  /** Eval handlers, keyed by handler id. */
  readonly evals?: EntityEvalDeclaration | undefined;
  /** Durable job handlers, keyed by job type. */
  readonly jobs?: Record<string, EntityJobDeclaration> | undefined;
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
 * What to do with a create request of a given input shape: hand it to a
 * declared job, or refuse it with a message.
 *
 * Deliberately data rather than a callback. A callback in the create path
 * is arbitrary code whose reported outcome the runtime has to take on
 * trust — a package could claim it created something it did not. Here the
 * runtime enqueues the job and reports the outcome itself, so a package
 * cannot misreport what happened.
 */
export type EntityCreateRoute =
  { readonly delegate: string } | { readonly reject: string };

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
export interface EntityConversationReader {
  get(
    conversationId: string,
  ): Promise<{ channelName?: string | undefined } | null>;
}

/**
 * What a declared eval handler is given. Evals exercise the same
 * capabilities generation does, so they share its context rather than
 * getting a parallel one.
 */
export type EntityEvalContext = EntityGenerationContext;

/**
 * Eval handlers for this entity type, keyed by handler id. The runtime
 * registers each with the eval namespace.
 */
export type EntityEvalDeclaration = Record<
  string,
  (input: unknown, context: EntityEvalContext) => Promise<unknown>
>;

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
 * Content generation is a job like any other — the runtime just names it
 * `{entityType}:generation` — so it shares the job shape.
 */
export type EntityGenerationDeclaration<
  TInputSchema extends z.ZodType = z.ZodType,
> = EntityJobDeclaration<TInputSchema>;

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
  };
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
