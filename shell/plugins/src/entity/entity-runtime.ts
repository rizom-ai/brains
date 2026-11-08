import {
  SdkError,
  type ImageAspectRatio,
  type JobContract,
  type PublishMediaData,
} from "@brains/contracts";
import {
  findEntityByIdentifier,
  type BaseEntity,
  type ContentVisibility,
  type CreateResultAttachment,
  type IEntityService,
  type SearchWithDistancesRequest,
} from "@brains/entity-service";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type { AnchorProfile } from "../contracts/identity";
import type { AIGenerationSchema } from "./ai-types";
import type { UniqueTitleContext } from "../service/create-entity-with-unique-title";
import type {
  AnyEntityDefinition,
  DataSourceListOptions,
  EntityCreateUploadReader,
  EntityGenerationAI,
  EntityGenerationLink,
  EntityGenerationResult,
  EntityJobDeclaration,
  EntityJobHandleContext,
  EntityOf,
  EntityReader,
  EntityVisibility,
} from "./entity-definition-contract";

/**
 * Internal runtime capabilities bound to one entity callback's call, for
 * first-party packages only. A first-party definition reaches them with
 * `entityRuntime(context)` on the context it was handed; the public context
 * types never name them, and a context the runtime did not build has none.
 *
 * Each keeps the call's authority: `nearest` reads at the call's
 * visibility, `packageEntities` reads only the declaring package's own
 * types, at every visibility, and nothing here writes.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-entity-runtime)
 * until each capability is public or no first-party package needs it.
 */
export interface EntityRuntime {
  /**
   * Records of a type nearest a query by embedding distance, closest
   * first, at the call's visibility. Distances are raw cosine distances.
   */
  nearest<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    query: string,
    options?: { maxDistance?: number; limit?: number },
  ): Promise<Array<{ entity: EntityOf<TDefinition>; distance: number }>>;
  /** One structured AI answer to a free-form prompt. */
  generateObject<TSchema extends z.ZodType>(
    prompt: string,
    schema: TSchema,
  ): Promise<z.output<TSchema>>;
  /**
   * Generate through a template the declaring type declares, named
   * locally, in the brain's voice when asked, as the entity plugin classes
   * generated through their own templates from create routes, checks and
   * job handlers. A template the type does not declare is refused.
   */
  readonly generate: EntityGenerationAI["generate"];
  /**
   * A generation's result, marked so the runtime creates it under the next
   * free id when its own is taken, as the entity plugin classes' generations
   * created with `deduplicateId`. A generation filling an allocated entity
   * keeps that entity's id. Elsewhere the mark has no effect.
   */
  deduplicated<TResult extends EntityGenerationResult>(
    result: TResult,
  ): TResult;
  /** Reads of the declaring package's own types, at every visibility. */
  readonly packageEntities: EntityReader;
  /**
   * A create route's answer that hands the request to the ordinary create,
   * as an entity plugin's interceptor continued it: unchanged, or with this
   * title and content in place of the request's and its stated fields
   * folded in, and with the target it resolved. The runtime performs it at
   * the caller's authority, choosing the id from the title and making it
   * unique, as the direct create does. Outside the brain's runtime it is a
   * refusal.
   */
  ordinaryCreate(
    document?: OrdinaryCreateDocument,
    options?: OrdinaryCreateOptions,
  ): { readonly refuse: string };
  /**
   * A create route's answer that writes a pending placeholder and queues a
   * contract job to fill it, as an entity plugin's interceptor did: an
   * existing record with the placeholder's id is reused, not written over,
   * and one at a different visibility than the request asks is refused. The
   * placeholder is written as the caller, and the route is answered
   * `generating` with the job's id. Outside the brain's runtime it is a
   * refusal.
   */
  queued(create: QueuedCreate): { readonly refuse: string };
  /**
   * A create route's answer that writes a complete record as the caller,
   * under the next free id when this one is taken, and answers `created`.
   * Outside the brain's runtime it is a refusal.
   */
  stored(create: StoredCreate): { readonly refuse: string };
  /**
   * Untyped reads of any entity type, at the call's own scope: a data
   * source's build scope (public, and only published records in a
   * production build), a create route's public scope, which the entity
   * plugin classes read targets and sources at, or a contract job's run.
   * They never widen the scope and never write.
   */
  readonly anyEntities: AnyEntityReads;
  /** The brain's image model. Contract jobs only. */
  readonly images: EntityRuntimeImages;
  /** Attachments other types provide, such as a rendered PDF. Contract jobs only. */
  readonly attachments: EntityRuntimeAttachments;
  /** The runtime's shared upload store. Contract jobs only. */
  readonly uploads: EntityCreateUploadReader;
  /** The package's logger, as its entity plugin class logged. */
  readonly logger: Logger;
  /** The anchor's profile, as the shell's identity holds it now, read-only. */
  readonly identity: EntityRuntimeIdentity;
  /**
   * Point a target at a record of the declaring type: set a field, or add
   * to a list, dropping entries the record supersedes. The generation-link
   * rules hold, and the target must be visible at the run's read scope, but
   * the target's action policy does not: the write is the runtime's own
   * follow-up on a target the enqueuer named, as the entity plugin classes'
   * job handlers made it. Contract jobs only.
   */
  linkInto(entityId: string, link: EntityGenerationLink): Promise<void>;
}

/** Read-only, untyped reads across entity types. */
export interface AnyEntityReads {
  getEntityTypes(): string[];
  listEntities(request: {
    readonly entityType: string;
    readonly options?:
      | {
          readonly filter?:
            | {
                readonly metadata?:
                  Readonly<Record<string, unknown>> | undefined;
              }
            | undefined;
          readonly limit?: number | undefined;
        }
      | undefined;
  }): Promise<BaseEntity[]>;
  getEntity(request: {
    readonly entityType: string;
    readonly id: string;
  }): Promise<BaseEntity | null>;
  /** A record by its id, else its slug, else its title. */
  find(entityType: string, identifier: string): Promise<BaseEntity | null>;
}

export interface EntityRuntimeIdentity {
  getProfile(): AnchorProfile;
}

export interface EntityRuntimeImages {
  canGenerate(): boolean;
  generate(
    prompt: string,
    options?: { readonly aspectRatio?: ImageAspectRatio | undefined },
  ): Promise<{ readonly dataUrl: string }>;
}

export interface EntityRuntimeAttachments {
  resolve(request: {
    readonly sourceEntityType: string;
    readonly sourceEntityId: string;
    readonly attachmentType: string;
  }): Promise<PublishMediaData | undefined>;
}

/** The reads an untyped view reads through. */
export type AnyEntityService = Pick<
  IEntityService,
  "getEntityTypes" | "listEntities" | "getEntity" | "getEntityRaw"
>;

/** What an ordinary create takes in place of the request's own. */
export interface OrdinaryCreateDocument {
  readonly title?: string | undefined;
  readonly content: string;
  readonly fields?: Readonly<Record<string, unknown>> | undefined;
}

export interface OrdinaryCreateOptions {
  /** The request's target, resolved from the identifier it named. */
  readonly targetEntityId?: string | undefined;
}

export interface QueuedCreate {
  /** The record the job fills, and the answer names. */
  readonly entityId: string;
  /** Unset, the job fills a record that already exists. */
  readonly placeholder?:
    | {
        readonly content: string;
        readonly metadata: Readonly<Record<string, unknown>>;
        /** Unset, the store's default; set, a record that exists at another is refused. */
        readonly visibility?: EntityVisibility | undefined;
      }
    | undefined;
  readonly job: {
    readonly contract: JobContract<z.ZodType>;
    readonly data: unknown;
    /** Queue the job with the caller as its requester, for attribution. */
    readonly attributed?: boolean | undefined;
  };
  readonly attachment: CreateResultAttachment;
}

export interface StoredCreate {
  readonly record: {
    readonly id: string;
    readonly content: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  };
  attachment(written: { readonly entityId: string }): CreateResultAttachment;
}

/** Where an untyped view reads, and the scope it reads each type at. */
export interface AnyEntityBinding {
  readonly service: AnyEntityService;
  /** Unset, the service is already scoped, as a build's is. */
  readonly scope?: ((entityType: string) => ContentVisibility) | undefined;
}

/** What a contract job's own capabilities are bound to. */
export interface ContractJobRuntimeBinding {
  readonly images: EntityRuntimeImages;
  readonly attachments: EntityRuntimeAttachments;
  readonly uploads: EntityCreateUploadReader;
  readonly logger: Logger;
  linkInto(entityId: string, link: EntityGenerationLink): Promise<void>;
}

/** What binding a call's runtime needs. */
export interface EntityRuntimeBinding {
  /** Where the call is, for the refusals of what it does not offer. */
  readonly where: string;
  /** Reads at the call's visibility. */
  readonly reader: EntityReader;
  /** Reads as the package acting as itself. */
  readonly packageReader: EntityReader;
  readonly ownsType: (entityType: string) => boolean;
  readonly searchWithDistances: (
    request: SearchWithDistancesRequest,
  ) => Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  >;
  readonly generateObject: <T>(
    prompt: string,
    schema: AIGenerationSchema<T>,
  ) => Promise<{ object: T }>;
  readonly anyEntities?: AnyEntityBinding | undefined;
  /** Template generation for the declaring type; unset, refused. */
  readonly generate?: EntityGenerationAI["generate"] | undefined;
  /** The package's logger; unset, a contract job's, else refused. */
  readonly logger?: Logger | undefined;
  readonly identity?: EntityRuntimeIdentity | undefined;
  readonly job?: ContractJobRuntimeBinding | undefined;
}

const entityRuntimeKey = Symbol("rizom.entity-runtime");
const ordinaryCreateKey = Symbol("rizom.ordinary-create");
const queuedCreateKey = Symbol("rizom.queued-create");
const storedCreateKey = Symbol("rizom.stored-create");
const contractJobKey = Symbol("rizom.contract-job");
const deduplicatedKey = Symbol("rizom.deduplicated-generation");

/** Whether a generation's result asks to land under the next free id. */
export function isDeduplicated(result: object): boolean {
  return Reflect.get(result, deduplicatedKey) === true;
}

/** A resolution only the runtime's accessor marks; elsewhere, a refusal. */
function marked(
  key: symbol,
  refuse: string,
  value: object,
): {
  readonly refuse: string;
} {
  const resolution = { refuse };
  Object.defineProperty(resolution, key, {
    value: Object.freeze(value),
    enumerable: false,
  });
  return Object.freeze(resolution);
}

/**
 * The ordinary create a route answered, when it did: the document it hands
 * on, or `null` for the request as made, and the target it resolved.
 */
export function ordinaryCreateOf(resolution: object):
  | {
      document: OrdinaryCreateDocument | null;
      options: OrdinaryCreateOptions;
    }
  | undefined {
  const found: unknown = Reflect.get(resolution, ordinaryCreateKey);
  if (typeof found !== "object" || found === null) return undefined;
  const document: unknown = Reflect.get(found, "document");
  const targetEntityId: unknown = Reflect.get(found, "targetEntityId");
  return {
    document: isOrdinaryCreateDocument(document) ? document : null,
    options: typeof targetEntityId === "string" ? { targetEntityId } : {},
  };
}

/** The queued create a route answered, when it did. */
export function queuedCreateOf(resolution: object): QueuedCreate | undefined {
  const found: unknown = Reflect.get(resolution, queuedCreateKey);
  return isQueuedCreate(found) ? found : undefined;
}

/** The stored create a route answered, when it did. */
export function storedCreateOf(resolution: object): StoredCreate | undefined {
  const found: unknown = Reflect.get(resolution, storedCreateKey);
  return isStoredCreate(found) ? found : undefined;
}

function isQueuedCreate(value: unknown): value is QueuedCreate {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "entityId") === "string" &&
    typeof Reflect.get(value, "job") === "object"
  );
}

function isStoredCreate(value: unknown): value is StoredCreate {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "record") === "object" &&
    typeof Reflect.get(value, "attachment") === "function"
  );
}

function isOrdinaryCreateDocument(
  value: unknown,
): value is OrdinaryCreateDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "content") === "string"
  );
}

/**
 * A first-party job another package queues through its contract: the
 * queued data is the contract's input, as written, with no requester
 * beside it, and the job runs as the package, as the entity plugin
 * classes' job handlers did. Declared in a type's `jobs` under the local
 * name its contract's type scopes to; the runtime refuses any other.
 */
export function contractJob<TInputSchema extends z.ZodType>(
  contract: JobContract<TInputSchema>,
  declaration: {
    handle(
      context: EntityJobHandleContext<z.output<TInputSchema>>,
    ): Promise<unknown>;
  },
): EntityJobDeclaration<TInputSchema> {
  const job = { input: contract.input, handle: declaration.handle };
  Object.defineProperty(job, contractJobKey, {
    value: Object.freeze({ type: contract.type }),
    enumerable: false,
  });
  return Object.freeze(job);
}

/** The contract a declared job answers, when it is a contract job. */
export function contractJobOf(
  declaration: object,
): { readonly type: string } | undefined {
  const found: unknown = Reflect.get(declaration, contractJobKey);
  if (typeof found !== "object" || found === null) return undefined;
  const type: unknown = Reflect.get(found, "type");
  return typeof type === "string" ? { type } : undefined;
}

function ownTypesOnly(
  reader: EntityReader,
  ownsType: (entityType: string) => boolean,
): EntityReader {
  const own = (definition: AnyEntityDefinition): void => {
    if (!ownsType(definition.type)) {
      throw new SdkError("permission_denied", {
        message: `Package reads reach only the package's own types, not "${definition.type}"`,
      });
    }
  };
  return Object.freeze({
    get: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> => {
      own(definition);
      return reader.get(definition, id);
    },
    list: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      options?: DataSourceListOptions,
    ): Promise<readonly EntityOf<TDefinition>[]> => {
      own(definition);
      return reader.list(definition, options);
    },
    count: async (definition: AnyEntityDefinition): Promise<number> => {
      own(definition);
      return reader.count(definition);
    },
  });
}

/** A capability a call does not offer, refused with where it is. */
function unavailable(name: string, where: string): () => never {
  return (): never => {
    throw new Error(`${name} is not available in ${where}`);
  };
}

function unavailableGenerate(where: string): EntityGenerationAI["generate"] {
  return async (): Promise<never> => {
    throw new Error(`generate is not available in ${where}`);
  };
}

function unavailableAnyEntities(where: string): AnyEntityReads {
  const refuse = unavailable("anyEntities", where);
  return Object.freeze({
    getEntityTypes: refuse,
    listEntities: refuse,
    getEntity: refuse,
    find: refuse,
  });
}

function unavailableJob(where: string): ContractJobRuntimeBinding {
  return {
    images: Object.freeze({
      canGenerate: unavailable("images", where),
      generate: unavailable("images", where),
    }),
    attachments: Object.freeze({
      resolve: unavailable("attachments", where),
    }),
    uploads: Object.freeze({
      read: unavailable("uploads", where),
      readRecord: unavailable("uploads", where),
    }),
    linkInto: unavailable("linkInto", where),
    logger: unavailableLogger(where),
  };
}

/** A logger that refuses, where the call has none to offer. */
function unavailableLogger(where: string): Logger {
  const refuse = unavailable("logger", where);
  return Object.freeze({
    silly: refuse,
    verbose: refuse,
    debug: refuse,
    info: refuse,
    warn: refuse,
    error: refuse,
    child: refuse,
    setUseStderr: refuse,
  });
}

/**
 * Untyped reads through the service the call is bound to. Requests are
 * rebuilt from the fields the view names, so no scope or option a caller
 * passes can widen what the call may read.
 */
function scopedAnyEntities({
  service,
  scope,
}: AnyEntityBinding): AnyEntityReads {
  const visibility = (
    entityType: string,
  ): { visibilityScope?: ContentVisibility } =>
    scope ? { visibilityScope: scope(entityType) } : {};
  return Object.freeze({
    getEntityTypes: (): string[] => service.getEntityTypes(),
    listEntities: (
      request: Parameters<AnyEntityReads["listEntities"]>[0],
    ): Promise<BaseEntity[]> => {
      const metadata = request.options?.filter?.metadata;
      const limit = request.options?.limit;
      const scoped = visibility(request.entityType);
      return service.listEntities({
        entityType: request.entityType,
        options: {
          ...((metadata !== undefined || scoped.visibilityScope) && {
            filter: {
              ...(metadata !== undefined && { metadata: { ...metadata } }),
              ...scoped,
            },
          }),
          ...(limit !== undefined && { limit }),
        },
      });
    },
    getEntity: (
      request: Parameters<AnyEntityReads["getEntity"]>[0],
    ): Promise<BaseEntity | null> =>
      service.getEntity({
        entityType: request.entityType,
        id: request.id,
        ...visibility(request.entityType),
      }),
    find: (
      entityType: string,
      identifier: string,
    ): Promise<BaseEntity | null> =>
      findEntityByIdentifier(
        service,
        entityType,
        identifier,
        undefined,
        scope ? scope(entityType) : undefined,
      ),
  });
}

function bindEntityRuntime(binding: EntityRuntimeBinding): EntityRuntime {
  const job = binding.job ?? unavailableJob(binding.where);
  return Object.freeze({
    async nearest<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      query: string,
      options: { maxDistance?: number; limit?: number } = {},
    ): Promise<Array<{ entity: EntityOf<TDefinition>; distance: number }>> {
      const { maxDistance, limit } = options;
      const hits = (
        await binding.searchWithDistances({
          query,
          types: [definition.type],
          ...(maxDistance !== undefined && { maxDistance }),
        })
      )
        .filter(
          (hit) =>
            hit.entityType === definition.type &&
            (maxDistance === undefined || hit.distance <= maxDistance),
        )
        .sort((left, right) => left.distance - right.distance);
      // Read at the call's visibility: a hit the caller may not see is not
      // a hit.
      const read = await Promise.all(
        hits.map(async (hit) => ({
          entity: await binding.reader.get(definition, hit.entityId),
          distance: hit.distance,
        })),
      );
      const visible = read.flatMap(({ entity, distance }) =>
        entity ? [{ entity, distance }] : [],
      );
      return limit === undefined ? visible : visible.slice(0, limit);
    },
    async generateObject<TSchema extends z.ZodType>(
      prompt: string,
      schema: TSchema,
    ): Promise<z.output<TSchema>> {
      const { object } = await binding.generateObject(prompt, schema);
      return schema.parse(object);
    },
    generate: binding.generate ?? unavailableGenerate(binding.where),
    deduplicated: <TResult extends EntityGenerationResult>(
      result: TResult,
    ): TResult => {
      const marked = { ...result };
      Object.defineProperty(marked, deduplicatedKey, {
        value: true,
        enumerable: false,
      });
      return marked;
    },
    packageEntities: ownTypesOnly(binding.packageReader, binding.ownsType),
    ordinaryCreate: (
      document?: OrdinaryCreateDocument,
      options?: OrdinaryCreateOptions,
    ): { readonly refuse: string } =>
      marked(
        ordinaryCreateKey,
        "This create hands on to the ordinary create, which only the brain's runtime performs",
        {
          document: document ? Object.freeze({ ...document }) : null,
          ...(options?.targetEntityId !== undefined && {
            targetEntityId: options.targetEntityId,
          }),
        },
      ),
    queued: (create: QueuedCreate): { readonly refuse: string } =>
      marked(
        queuedCreateKey,
        "This create queues a job, which only the brain's runtime performs",
        { ...create },
      ),
    stored: (create: StoredCreate): { readonly refuse: string } =>
      marked(
        storedCreateKey,
        "This create stores a record, which only the brain's runtime performs",
        { ...create },
      ),
    anyEntities: binding.anyEntities
      ? scopedAnyEntities(binding.anyEntities)
      : unavailableAnyEntities(binding.where),
    images: job.images,
    attachments: job.attachments,
    uploads: job.uploads,
    logger: binding.logger ?? job.logger,
    identity:
      binding.identity ??
      Object.freeze({ getProfile: unavailable("identity", binding.where) }),
    linkInto: (entityId: string, link: EntityGenerationLink): Promise<void> =>
      job.linkInto(entityId, link),
  });
}

/**
 * A data source's read context with its internal runtime: untyped reads at
 * the build's own scope. A data source neither searches, generates, writes
 * nor creates, so those refuse.
 */
export function withDataSourceRuntime<TContext extends object>(
  context: TContext,
  service: AnyEntityService,
): Readonly<TContext> {
  const where = "a data source";
  const refusingReader: EntityReader = Object.freeze({
    get: unavailable("packageEntities", where),
    list: unavailable("packageEntities", where),
    count: unavailable("packageEntities", where),
  });
  const runtime = bindEntityRuntime({
    where,
    reader: refusingReader,
    packageReader: refusingReader,
    ownsType: () => true,
    searchWithDistances: unavailable("nearest", where),
    generateObject: unavailable("generateObject", where),
    anyEntities: { service },
  });
  Object.defineProperty(context, entityRuntimeKey, {
    value: runtime,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(context);
}

/**
 * A callback context the runtime hands a definition, with the call's
 * internal runtime attached under a key no public type names. The context
 * is frozen afterwards, as every callback context is.
 */
export function withEntityRuntime<TContext extends object>(
  context: TContext,
  binding: EntityRuntimeBinding,
): Readonly<TContext> {
  Object.defineProperty(context, entityRuntimeKey, {
    value: bindEntityRuntime(binding),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(context);
}

function isEntityRuntime(value: unknown): value is EntityRuntime {
  return typeof value === "object" && value !== null;
}

/**
 * What `ensureUniqueTitle` reads, through a call's runtime: a record of
 * the title's id at the call's scope, one structured answer, and the
 * package's logger, as the entity plugin classes' generations read them.
 */
export function uniqueTitleContext(runtime: EntityRuntime): UniqueTitleContext {
  return {
    entityService: {
      getEntity: ({ entityType, id }) =>
        runtime.anyEntities.getEntity({ entityType, id }),
    },
    ai: {
      generateObject: async <T>(
        prompt: string,
        schema: AIGenerationSchema<T>,
      ): Promise<{ object: T }> => ({
        object: await runtime.generateObject(prompt, schema),
      }),
    },
    logger: runtime.logger,
  };
}

/**
 * The internal runtime bound to a callback's call. First-party packages
 * only: a context the brain's runtime did not build, such as a test double,
 * has none, and is refused.
 */
export function entityRuntime(context: object): EntityRuntime {
  const runtime: unknown = Reflect.get(context, entityRuntimeKey);
  if (!isEntityRuntime(runtime)) {
    throw new Error(
      "This context carries no entity runtime: entityRuntime() reaches internal capabilities of a callback context the brain's runtime built, for first-party packages only",
    );
  }
  return runtime;
}
