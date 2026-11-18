import { authenticatedUserId } from "@brains/contracts";
import {
  EntityWriteConflictError,
  createResultAttachmentSchema,
  internalFullScope,
  permissionToVisibilityScope,
  type ContentVisibility,
  type CreateCheckResult,
  type CreateExecutionContext,
  type CreateInput,
  type CreateInterceptionResult,
  type CreateInterceptor,
  type CreateResult,
} from "@brains/entity-service";
import type { JobOptions } from "@brains/job-queue";
import { getErrorMessage } from "@brains/utils/error";
import { definedFields } from "@brains/utils/strip-undefined";
import type { z } from "@brains/utils/zod";
import type { EntityPluginContext } from "./context";
import { createEntityReader } from "./entity-reader";
import {
  ordinaryCreateOf,
  queuedCreateOf,
  storedCreateOf,
  withEntityRuntime,
  type AnyEntityBinding,
  type EntityCreateCaller,
  type EntityRuntimeBinding,
  type QueuedAttribution,
  type QueuedCreate,
  type QueuedPlaceholder,
  type StoredCreate,
} from "./entity-runtime";
import { generationSource } from "./declarative-jobs";
import { createPendingEntity } from "./pending-ingestion";
import { createUploadSaveHandler } from "./upload-save";
import { sharedUploadScope } from "../service/upload-registry";
import { admitPackageJob, toolCaller } from "../service/job-authority";
import type {
  AnyEntityDefinition,
  AnyEntityJobDeclaration,
  EntityCreateAllocation,
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityCreateUploadReader,
  EntityReader,
} from "./entity-definition-contract";

/**
 * Which route a create request takes, by how the caller expressed it: an
 * upload or attachment reference first, then content, then a prompt, then
 * a URL alone. A conversation message arrives as content.
 */
function selectCreateRoute(
  routing: EntityCreateRouting,
  input: CreateInput,
  urlRoute?: EntityCreateRoute,
): EntityCreateRoute | undefined {
  switch (input.from?.kind) {
    case "entity-attachment":
      return routing.fromAttachment;
    case "upload":
      return routing.fromUpload;
    default:
      if (input.content) return routing.fromContent;
      if (input.prompt) return routing.fromPrompt;
      // A first-party type may decide a create from a URL alone.
      return input.url ? urlRoute : undefined;
  }
}

/** A detached copy no route can change under the runtime. */
export function deepFrozen<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFrozen);
    Object.freeze(value);
  }
  return value;
}

/** Whether a queued create's job is attributed to the caller. */
function isAttributed(queued: QueuedCreate): boolean {
  const { attributed } = queued.job;
  return attributed !== undefined && attributed !== false;
}

/** Who asked for a create, as a first-party route sees them. */
function createCaller(
  executionContext: CreateExecutionContext,
): EntityCreateCaller {
  const userId = authenticatedUserId(executionContext);
  return Object.freeze({
    interfaceType: executionContext.interfaceType,
    actor: executionContext.actor,
    ...definedFields({
      userId,
      channelId: executionContext.channelId,
      channelName: executionContext.channelName,
    }),
  });
}

/** Who a create is attributed to in the store. */
function eventContextOf(executionContext: CreateExecutionContext): {
  readonly actor: CreateExecutionContext["actor"];
  readonly interfaceType: string;
} {
  return {
    actor: executionContext.actor,
    interfaceType: executionContext.interfaceType,
  };
}

/**
 * A queued job's attribution to the caller who asked for it, as the entity
 * plugin classes queued their own jobs.
 */
function attributionJobOptions(
  source: string,
  executionContext: CreateExecutionContext,
  attribution: QueuedAttribution = {},
): JobOptions {
  return {
    source,
    metadata: {
      operationType: attribution.operationType ?? "content_operations",
      ...(attribution.channel === true &&
        executionContext.channelId !== undefined && {
          channelId: executionContext.channelId,
        }),
      interfaceType: executionContext.interfaceType,
      requestedByActor: executionContext.actor,
      ...(executionContext.actor.kind === "user"
        ? { requestedByUserId: executionContext.actor.userId }
        : {}),
      requestedByInterface: executionContext.interfaceType,
    },
  };
}

function createFailure(error: string): CreateResult {
  return { success: false, error };
}

function callerScope(
  executionContext: CreateExecutionContext,
): ContentVisibility {
  return permissionToVisibilityScope(executionContext.userPermissionLevel);
}

function createSuccess(
  status: "created" | "existing" | "updated",
  entityId: string,
  attachment: ((written: { readonly entityId: string }) => unknown) | undefined,
): CreateResult {
  return {
    success: true,
    data: {
      status,
      entityId,
      ...(attachment && {
        attachment: createResultAttachmentSchema.parse(
          attachment({ entityId }),
        ),
      }),
    },
  };
}

/** What a declared type's create routing is built from. */
export interface EntityCreateRouterOptions {
  readonly context: EntityPluginContext;
  readonly definition: AnyEntityDefinition;
  /** The type's plugin, which a route's queued work names as its source. */
  readonly pluginId: string;
  readonly routing: EntityCreateRouting;
  readonly urlRoute: EntityCreateRoute | undefined;
  /** The internal runtime a route reaches through entityRuntime(context). */
  readonly runtime: (
    reader: EntityReader,
    where: string,
    anyEntities: AnyEntityBinding,
  ) => EntityRuntimeBinding;
}

/**
 * A declared type's create routing: the interceptor, the pre-confirmation
 * check and the upload handler it registers, and how each decision a route
 * makes is performed.
 */
export class EntityCreateRouter {
  private readonly context: EntityPluginContext;
  private readonly definition: AnyEntityDefinition;
  private readonly entityType: string;
  private readonly pluginId: string;
  private readonly jobs: Readonly<Record<string, AnyEntityJobDeclaration>>;
  private readonly routing: EntityCreateRouting;
  private readonly urlRoute: EntityCreateRoute | undefined;
  private readonly runtime: EntityCreateRouterOptions["runtime"];

  constructor(options: EntityCreateRouterOptions) {
    this.context = options.context;
    this.definition = options.definition;
    this.entityType = options.definition.type;
    this.pluginId = options.pluginId;
    this.jobs = options.definition.jobs ?? {};
    this.routing = options.routing;
    this.urlRoute = options.urlRoute;
    this.runtime = options.runtime;
  }

  register(): void {
    const { context, routing, urlRoute } = this;
    const interceptCreate: CreateInterceptor = (input, executionContext) =>
      this.routeCreate(input, executionContext);
    context.entities.registerCreateInterceptor(
      this.entityType,
      interceptCreate,
    );
    // Checked before the user confirms, through the route the confirmed
    // create will take; a rejecting route says so before anyone is asked.
    context.entities.registerCreateCheck(
      this.entityType,
      async (input, executionContext): Promise<CreateCheckResult> => {
        const route = selectCreateRoute(routing, input, urlRoute);
        if (!route) return { kind: "ready" };
        if ("reject" in route) return { kind: "error", error: route.reject };
        return route.check
          ? route.check(this.createContext(input, executionContext))
          : { kind: "ready" };
      },
    );
    // The upload endpoint routes by media type into the same route, rather
    // than a second handler re-implementing the create.
    const mediaTypes = routing.fromUpload?.mediaTypes ?? [];
    if (mediaTypes.length > 0) {
      context.entities.registerUploadSaveHandler({
        entityType: this.entityType,
        mediaTypes: [...mediaTypes],
        handler: createUploadSaveHandler(
          this.entityType,
          interceptCreate,
          `Upload was not handled by ${this.entityType}`,
        ),
      });
    }
  }

  private async routeCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateInterceptionResult> {
    const route = selectCreateRoute(this.routing, input, this.urlRoute);
    if (!route) return { kind: "continue", input };
    if ("reject" in route) {
      return { kind: "handled", result: createFailure(route.reject) };
    }
    const resolution = await route.resolve(
      this.createContext(input, executionContext),
    );
    // A first-party route handing on to the ordinary create, which system
    // create performs at the caller's authority.
    const ordinary = ordinaryCreateOf(resolution);
    if (ordinary) {
      const { targetEntityId } = ordinary.options;
      const targeted: CreateInput = {
        ...input,
        ...(targetEntityId !== undefined && { targetEntityId }),
      };
      if (!ordinary.document) return { kind: "continue", input: targeted };
      const { fields: _folded, ...request } = targeted;
      const { title, content, fields } = ordinary.document;
      return {
        kind: "continue",
        input: {
          ...request,
          ...(title !== undefined && { title }),
          content,
          ...(fields !== undefined && { fields: { ...fields } }),
        },
      };
    }
    // First-party routes that queue a contract job, or store a complete
    // record, as an entity plugin's interceptor did.
    const queued = queuedCreateOf(resolution);
    if (queued) {
      return {
        kind: "handled",
        result: await this.applyQueuedCreate(queued, executionContext),
      };
    }
    const stored = storedCreateOf(resolution);
    if (stored) {
      return {
        kind: "handled",
        result: await this.applyStoredCreate(stored, input, executionContext),
      };
    }
    return {
      kind: "handled",
      result: await this.applyCreateResolution(
        resolution,
        input,
        executionContext,
      ),
    };
  }

  /** What a route decides with: frozen, read-only, at the caller's level. */
  private createContext(
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): EntityCreateContext {
    const context = this.context;
    const uploads = context.uploads.scoped(sharedUploadScope);
    const reader: EntityCreateUploadReader = Object.freeze({
      read: (uploadId: string) => uploads.read(uploadId),
      readRecord: (uploadId: string) => uploads.readRecord(uploadId),
    });
    const entities = createEntityReader(
      context.entityService,
      callerScope(executionContext),
    );
    return withEntityRuntime(
      {
        input: deepFrozen(structuredClone(input)),
        entities,
        uploads: reader,
      },
      {
        ...this.runtime(entities, "a create route", {
          // Targets and sources are read public, as the entity plugin
          // classes' create interceptors read them.
          service: context.entityService,
          scope: () => "public",
        }),
        caller: createCaller(executionContext),
      },
    );
  }

  /**
   * Perform what a route decided. The runtime writes, so "created" and
   * "updated" describe what it did rather than what the route claims.
   */
  private async applyCreateResolution(
    resolution: EntityCreateResolution | EntityCreateAllocation,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    if ("delegate" in resolution) {
      return this.applyDelegation(resolution, input, executionContext);
    }
    if ("refuse" in resolution) return createFailure(resolution.refuse);
    const { entityService } = this.context;
    const visibilityScope = callerScope(executionContext);
    const eventContext = eventContextOf(executionContext);

    if ("existing" in resolution) {
      const found = await entityService.getEntity({
        entityType: this.entityType,
        id: resolution.existing.id,
        visibilityScope,
      });
      if (!found) {
        return createFailure(
          `Cannot reuse ${this.entityType} "${resolution.existing.id}", which does not exist`,
        );
      }
      return createSuccess("existing", found.id, resolution.attachment);
    }

    const target =
      "update" in resolution ? resolution.update : resolution.create;
    const metadata = this.definition.metadata.safeParse(target.metadata);
    if (!metadata.success) return createFailure(this.invalid(metadata.error));

    if ("update" in resolution) {
      const existing = await entityService.getEntity({
        entityType: this.entityType,
        id: resolution.update.id,
        visibilityScope,
      });
      if (!existing) {
        return createFailure(
          `Cannot update ${this.entityType} "${resolution.update.id}", which does not exist`,
        );
      }
      const written = await entityService.updateEntity({
        entity: {
          ...existing,
          content: resolution.update.content,
          metadata: metadata.data,
        },
        options: { eventContext },
      });
      return createSuccess("updated", written.entityId, undefined);
    }

    // Create-if-absent: a route that did not see an entity at the caller's
    // level must not write over one it could not see.
    const taken = await entityService.getEntity({
      entityType: this.entityType,
      id: resolution.create.id,
      visibilityScope: internalFullScope(
        "create route checks whether its id is taken; no content returned",
      ),
    });
    const alreadyExists = `A ${this.entityType} "${resolution.create.id}" already exists`;
    if (taken) return createFailure(alreadyExists);
    try {
      const written = await entityService.createEntity({
        entity: {
          id: resolution.create.id,
          entityType: this.entityType,
          content: resolution.create.content,
          metadata: metadata.data,
          ...(input.visibility !== undefined && {
            visibility: input.visibility,
          }),
        },
        options: {
          conditionalWrite: { expectedRevision: null },
          eventContext,
        },
      });
      return createSuccess("created", written.entityId, resolution.attachment);
    } catch (error) {
      if (error instanceof EntityWriteConflictError) {
        return createFailure(alreadyExists);
      }
      throw error;
    }
  }

  private invalid(error: z.ZodError): string {
    return `Invalid ${this.entityType} metadata: ${error.issues
      .map(({ path, message }) => `${path.join(".") || "metadata"}: ${message}`)
      .join("; ")}`;
  }

  /**
   * Allocate now and finish later: write the placeholder (or find the
   * entity), then queue the declared job with its id. Everything the
   * delegation needs is checked before anything is written.
   */
  private async applyDelegation(
    allocation: EntityCreateAllocation,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    const context = this.context;
    const { job: name, input: jobInput = {} } = allocation.delegate;
    // "generation" names the type's own generation, queued as
    // `{type}:generation`, as an entity plugin's interceptor queued it.
    const ownGeneration =
      name === "generation" ? this.definition.generation : undefined;
    const job =
      ownGeneration ??
      (Object.hasOwn(this.jobs, name) ? this.jobs[name] : undefined);
    if (!job) {
      return createFailure(
        `${this.entityType} declares no job named "${name}"`,
      );
    }
    const allocates = "create" in allocation || "existing" in allocation;
    if (allocates && !("generate" in job)) {
      return createFailure(
        `${this.entityType} job "${name}" does not generate, so it cannot fill an allocated entity`,
      );
    }
    const parsed = job.input.safeParse(jobInput);
    if (!parsed.success) {
      return createFailure(
        `Invalid input for ${this.entityType} job "${name}": ${parsed.error.issues
          .map(({ message }) => message)
          .join("; ")}`,
      );
    }
    // The caller starts the job, and it runs with their authority, so they
    // are admitted before anything is written; one the brain no longer
    // knows is refused here.
    const queued = await admitPackageJob(
      context.jobAuthority,
      toolCaller(executionContext),
      jobInput,
    );

    const allocated = await this.allocate(allocation, input, executionContext);
    if ("error" in allocated) return createFailure(allocated.error);
    const entityId = allocated.entityId;
    try {
      const data = {
        ...queued,
        ...(entityId !== undefined && { entityId }),
        ...("generate" in job &&
          definedFields({ source: generationSource(input) })),
      };
      const jobId = ownGeneration
        ? // Content work for the caller who asked, routed back to their
          // conversation, as the classes queued their generations.
          await context.jobs.enqueue({
            type: `${this.entityType}:generation`,
            data,
            toolContext: executionContext,
            options: {
              source: this.pluginId,
              metadata: { operationType: "content_operations" },
            },
          })
        : await context.jobs.enqueue({
            type: name,
            // The input as written, and beside it the entity a generation
            // fills and the entries the request named it from.
            data,
            toolContext: {
              interfaceType: executionContext.interfaceType,
              actor: executionContext.actor,
              ...definedFields({ channelId: executionContext.channelId }),
            },
          });
      const attachment =
        "attachment" in allocation ? allocation.attachment : undefined;
      return {
        success: true,
        data: {
          status: "generating",
          jobId,
          ...(entityId !== undefined && {
            entityId,
            ...(attachment && {
              attachment: createResultAttachmentSchema.parse(
                attachment({ entityId }),
              ),
            }),
          }),
        },
      };
    } catch (error) {
      // No job will fill a placeholder this create wrote; left behind it
      // would stay generating forever.
      if (allocated.written) {
        await context.entityService
          .deleteEntity({ entityType: this.entityType, id: allocated.written })
          .catch((cleanupError: unknown) => {
            context.logger.warn("Failed to remove an unqueued placeholder", {
              entityId: allocated.written,
              error: cleanupError,
            });
          });
      }
      return createFailure(getErrorMessage(error));
    }
  }

  private async allocate(
    allocation: EntityCreateAllocation,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<
    | { readonly entityId: string | undefined; readonly written?: string }
    | { readonly error: string }
  > {
    const { entityService } = this.context;
    if ("existing" in allocation) {
      const found = await entityService.getEntity({
        entityType: this.entityType,
        id: allocation.existing.id,
        visibilityScope: callerScope(executionContext),
      });
      return found
        ? { entityId: found.id }
        : {
            error: `Cannot reuse ${this.entityType} "${allocation.existing.id}", which does not exist`,
          };
    }
    if (!("create" in allocation)) return { entityId: undefined };
    const metadata = this.definition.metadata.safeParse(
      allocation.create.metadata,
    );
    if (!metadata.success) return { error: this.invalid(metadata.error) };
    // Deduplicated, as system_generate's stub is: a second import lands
    // beside the first rather than on top of it.
    const written = await entityService.createEntity({
      entity: {
        id: allocation.create.id,
        entityType: this.entityType,
        content: allocation.create.content,
        metadata: metadata.data,
        ...(input.visibility !== undefined && { visibility: input.visibility }),
      },
      options: {
        deduplicateId: true,
        eventContext: eventContextOf(executionContext),
      },
    });
    return { entityId: written.entityId, written: written.entityId };
  }

  /**
   * Write a first-party route's pending placeholder and queue the contract
   * job that fills it, as an entity plugin's interceptor did: a record that
   * already has the id is reused rather than written over, and one at a
   * different visibility than asked is refused.
   */
  private async applyQueuedCreate(
    queued: QueuedCreate,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    const attributed = isAttributed(queued);
    const placeholder = queued.placeholder;
    if (placeholder?.deduplicate === true) {
      return this.applyDeduplicatedQueuedCreate(
        queued,
        placeholder,
        executionContext,
      );
    }
    if (placeholder) {
      const metadata = this.definition.metadata.safeParse(placeholder.metadata);
      if (!metadata.success) return createFailure(this.invalid(metadata.error));
      const now = new Date().toISOString();
      const pending = await createPendingEntity({
        entityService: this.context.entityService,
        entity: {
          id: queued.entityId,
          entityType: this.entityType,
          content: placeholder.content,
          metadata: metadata.data,
          ...(placeholder.visibility !== undefined && {
            visibility: placeholder.visibility,
          }),
          created: now,
          updated: now,
        },
        ...(attributed && {
          options: { eventContext: eventContextOf(executionContext) },
        }),
      });
      if (
        placeholder.visibility !== undefined &&
        pending.existingEntity !== undefined &&
        pending.existingEntity.visibility !== placeholder.visibility
      ) {
        // Answered, as an entity plugin's interceptor answered it.
        return createFailure(
          `Existing ${this.entityType} visibility "${pending.existingEntity.visibility}" does not match requested visibility "${placeholder.visibility}".`,
        );
      }
    }
    return this.queueFill(queued, executionContext, queued.entityId);
  }

  /**
   * A queued create whose placeholder lands beside a record that has its id,
   * as an entity plugin's interceptor wrote one with `deduplicateId`: the
   * job is queued for, and the answer names, the id written, and the job's
   * input may be built from the placeholder as stored.
   */
  private async applyDeduplicatedQueuedCreate(
    queued: QueuedCreate,
    placeholder: NonNullable<QueuedCreate["placeholder"]>,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    const metadata = this.definition.metadata.safeParse(placeholder.metadata);
    if (!metadata.success) return createFailure(this.invalid(metadata.error));
    const now = new Date().toISOString();
    const created = await this.context.entityService.createEntity({
      entity: {
        id: queued.entityId,
        entityType: this.entityType,
        content: placeholder.content,
        metadata: metadata.data,
        ...(placeholder.visibility !== undefined && {
          visibility: placeholder.visibility,
        }),
        created: now,
        updated: now,
      },
      options: {
        deduplicateId: true,
        ...(isAttributed(queued) && {
          eventContext: eventContextOf(executionContext),
        }),
      },
    });
    return this.queueFill(queued, executionContext, created.entityId);
  }

  /** The record a queued create's job fills, as it is stored now. */
  private async writtenPlaceholder(
    entityId: string,
  ): Promise<QueuedPlaceholder> {
    const written = await this.context.entityService.getEntity({
      entityType: this.entityType,
      id: entityId,
      visibilityScope: internalFullScope(
        "read back the placeholder a queued create wrote; only its hash is handed on",
      ),
    });
    if (!written) {
      throw new Error(
        `The ${this.entityType} placeholder "${entityId}" could not be read back`,
      );
    }
    return { entityId: written.id, contentHash: written.contentHash };
  }

  /** Queue a queued create's job and answer generating. */
  private async queueFill(
    queued: QueuedCreate,
    executionContext: CreateExecutionContext,
    entityId: string,
  ): Promise<CreateResult> {
    const { data } = queued.job;
    // Input built from the placeholder reads it back as it was stored.
    const jobId = await this.context.jobs.enqueue(
      queued.job.contract,
      typeof data === "function"
        ? data(await this.writtenPlaceholder(entityId))
        : data,
      ...(isAttributed(queued)
        ? [
            {
              options: attributionJobOptions(
                this.pluginId,
                executionContext,
                typeof queued.job.attributed === "object"
                  ? queued.job.attributed
                  : undefined,
              ),
            },
          ]
        : []),
    );
    return {
      success: true,
      data: {
        entityId,
        status: "generating",
        jobId,
        ...(queued.attachment !== undefined && {
          attachment: createResultAttachmentSchema.parse(queued.attachment),
        }),
      },
    };
  }

  /**
   * Store a first-party route's complete record as the caller, under the
   * next free id when this one is taken, as an entity plugin's interceptor
   * did.
   */
  private async applyStoredCreate(
    stored: StoredCreate,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    const metadata = this.definition.metadata.safeParse(stored.record.metadata);
    if (!metadata.success) return createFailure(this.invalid(metadata.error));
    const { entityService } = this.context;
    // Bytes are staged first and published only with the record: a create
    // that does not write leaves an unpublished upload, discarded here.
    const stagedAsset =
      stored.bytes === undefined
        ? undefined
        : await entityService.stageAsset(stored.bytes, {
            ...(stored.maxBytes !== undefined && { maxBytes: stored.maxBytes }),
          });
    const content = stagedAsset
      ? stagedAsset.ref
      : "content" in stored.record
        ? stored.record.content
        : undefined;
    if (content === undefined) {
      return createFailure("A stored create needs content or bytes");
    }
    const now = new Date().toISOString();
    let written: Awaited<ReturnType<typeof entityService.createEntity>>;
    try {
      written = await entityService.createEntity({
        entity: {
          id: stored.record.id,
          entityType: this.entityType,
          content,
          metadata: metadata.data,
          ...(input.visibility !== undefined && {
            visibility: input.visibility,
          }),
          created: now,
          updated: now,
        },
        ...(stagedAsset && { stagedAsset }),
        options: {
          deduplicateId: true,
          eventContext: eventContextOf(executionContext),
        },
      });
    } catch (error) {
      if (stagedAsset) await entityService.discardStagedAsset(stagedAsset);
      throw error;
    }
    return {
      success: true,
      data: {
        entityId: written.entityId,
        status: "created",
        attachment: createResultAttachmentSchema.parse(
          stored.attachment({ entityId: written.entityId }),
        ),
      },
    };
  }
}
