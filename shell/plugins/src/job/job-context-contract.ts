import type {
  BaseEntity,
  ContentVisibility,
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
import type { Conversation, Message } from "../contracts/conversations";
/**
 * What a job reads about the conversation it was started from.
 *
 * The conversation and its messages, and deliberately nothing else: a
 * package that summarises a conversation needs to read it, but `list` and
 * `search` on the full namespace would let it read every conversation in
 * the brain rather than the one it was handed. Which is what
 * `conversation-memory` had to reach for, having no narrower option.
 */
export interface EntityConversationBatch {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
}

export interface EntityConversationReader {
  get(conversationId: string): Promise<Conversation | null>;
  /**
   * Messages in the order they were sent, newest last. `limit` caps how many
   * are read at all, so a long conversation does not have to be loaded whole
   * to summarise its tail.
   */
  getMessages(
    conversationId: string,
    options?: { readonly limit?: number | undefined },
  ): Promise<Message[]>;
  /** Fixed-query batch read for bounded projection waves. */
  getManyWithMessages(request: {
    readonly ids: readonly string[];
    readonly messageLimit: number;
  }): Promise<readonly EntityConversationBatch[]>;
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
    /**
     * How wide to read. Reads are unrestricted here by design, but the
     * default fails closed to public — and a package looking for its own
     * entity stored as "shared" has to say so, or it concludes there is
     * none and writes a second one beside it.
     */
    visibilityScope?: ContentVisibility | undefined;
  }): Promise<T | null>;
  /**
   * The entity someone named, by id, slug, or title.
   *
   * "Put a cover image on the launch post" names the post the way a person
   * would, and `getEntity` only answers to an id. Without this, a package
   * that has to honour a human-supplied identifier reaches past this surface
   * for a resolver — which is how `image` came to import one from the shell.
   */
  find<T extends BaseEntity>(
    entityType: string,
    identifier: string,
  ): Promise<T | null>;
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
   * Remove one of this package's own entities.
   *
   * A package that derives entities has to be able to un-derive them — a
   * decision superseded by a later one is removed, not left beside its
   * replacement. Scoped like the writes above, because deleting another
   * package's entity is the same trespass as writing one.
   */
  delete(entityType: string, id: string): Promise<boolean>;
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
