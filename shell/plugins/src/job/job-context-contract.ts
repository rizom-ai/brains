import type {
  BaseEntity,
  EntityInput,
  EntityMutationResult,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/entity-service";
import type { LoggerContract } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import type { IEntityAINamespace } from "../entity/ai-types";
import type { AnchorProfile } from "../contracts/identity";
import type { EntityDefinitionShape, EntityOf } from "../entity/entity-shape";
import type { ResolvedRuntimeUpload } from "../service/upload-registry";
import type { PublishMediaData } from "@brains/contracts";
/** What a job reads about the conversation it was started from. */
export interface EntityConversationReader {
  get(
    conversationId: string,
  ): Promise<{ channelName?: string | undefined } | null>;
}

/**
 * Entity access for a job handler: unrestricted reads, ownership-scoped
 * writes.
 *
 * Reads span types because useful work usually reads across them — a series
 * description is derived from the entities it indexes. Writes are limited to
 * the types the declaring package owns, and the runtime checks
 * `entity.entityType` against that set rather than trusting the caller.
 *
 * Writes take the entity rather than a definition object deliberately: the
 * common case is an entity's own job writing its own type, and passing the
 * definition there would mean the handler importing the definition that
 * declares it — a cycle.
 */
export interface JobEntityAccess {
  listEntities<T extends BaseEntity>(request: {
    entityType: string;
    options?: ListOptions;
  }): Promise<T[]>;
  getEntity<T extends BaseEntity>(request: {
    entityType: string;
    id: string;
  }): Promise<T | null>;
  getEntityTypes(): string[];
  search<T extends BaseEntity = BaseEntity>(request: {
    query: string;
    options?: SearchOptions;
  }): Promise<SearchResult<T>[]>;
  /**
   * Typed read: the entity comes back parsed to the definition's own shape,
   * rather than as a `BaseEntity` the caller has to narrow itself.
   */
  get<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    id: string,
  ): Promise<EntityOf<TDefinition> | null>;
  create<T extends BaseEntity>(
    entity: EntityInput<T>,
  ): Promise<EntityMutationResult>;
  update<T extends BaseEntity>(entity: T): Promise<EntityMutationResult>;
  /**
   * Record a durable placeholder before starting slow enrichment, so the
   * next turn can find the accepted item immediately.
   *
   * Idempotent: an existing entity with this id is returned untouched rather
   * than overwritten. The runtime does the lookup at full visibility — a
   * placeholder the caller could not otherwise see still counts as existing —
   * which is why this is a runtime call and not something a package assembles
   * from `get` and `create`.
   */
  createPending<T extends BaseEntity>(
    entity: EntityInput<T> & { readonly id: string },
  ): Promise<{ entityId: string; created: boolean }>;
  /**
   * Store the enriched result, updating the placeholder if one exists and
   * creating the entity outright if it does not.
   */
  saveProcessed<T extends BaseEntity>(
    entity: EntityInput<T> & { readonly id: string },
    options?: { readonly expectedContentHash?: string | undefined },
  ): Promise<EntityMutationResult>;
}

/**
 * The upload a job was handed, read by id.
 *
 * Narrowed to reading, and to the runtime's own upload namespace: a job
 * imports the file it was enqueued for, and does not get to choose where
 * uploads live, how clients refer to them, or which route served them.
 * Note declared all three to do a markdown import, including a chat
 * interface's route path — none of which affects which bytes come back.
 */
export interface JobUploadReader {
  read(uploadId: string): Promise<ResolvedRuntimeUpload>;
}

/**
 * Another entity's declared attachment, resolved by the job that renders it.
 *
 * Narrowed to resolving: a job asks the brain for "deck X as a carousel" and
 * gets the media back. Registering providers stays a declaration, so a job
 * cannot quietly add one.
 */
export interface JobAttachmentReader {
  resolve(request: {
    readonly sourceEntityType: string;
    readonly sourceEntityId: string;
    readonly attachmentType: string;
  }): Promise<PublishMediaData | undefined>;
}

export interface JobMessagePublisher {
  publish(input: {
    readonly topic: string;
    readonly data: object;
  }): Promise<void>;
}

export interface JobTemplateFormatter {
  format<TValue>(name: string, value: TValue): string;
}

/**
 * What every job handler receives, whether it was declared by an entity or
 * by a service package.
 *
 * There is one context because the two used to be complementary halves —
 * entity jobs could reach ai and write entities but never saw config;
 * service jobs saw config but had neither. Any package doing real work
 * needs the union, so there is no longer a split to choose between.
 *
 * Config is deliberately absent: a service declares jobs as a function of
 * config, so a handler closes over exactly the settings it needs.
 */
export interface JobHandlerContext<TInput> {
  readonly input: TInput;
  readonly entities: JobEntityAccess;
  readonly ai: IEntityAINamespace;
  readonly logger: LoggerContract;
  readonly conversations: EntityConversationReader;
  /**
   * The brain the work is done on behalf of. A handler generating prose in
   * the brain's voice needs its name and character; nothing here reaches
   * the identity service itself.
   */
  readonly identity: { getProfile(): AnchorProfile };
  readonly messaging: JobMessagePublisher;
  readonly progress: ProgressContract;
  readonly signal: AbortSignal;
  /**
   * The scoped name a template this package declared is registered under.
   *
   * A handler that generates has to name a template, and the runtime scopes
   * template names to the declaring plugin. Spelled out by hand, the name a
   * package writes is the one it had before it was scoped — which resolves
   * to nothing and fails as "Template not found" at generation time, far
   * from the declaration that caused it.
   */
  template(localName: string): string;
  readonly uploads: JobUploadReader;
  readonly attachments: JobAttachmentReader;
  /**
   * Absent for jobs declared by an entity: the entity plugin context
   * deliberately excludes template rendering, so there is nothing honest to
   * put here. Service-declared jobs always have it.
   */
  readonly templates?: JobTemplateFormatter | undefined;
}
