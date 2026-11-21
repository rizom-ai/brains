import {
  internalFullScope,
  type ContentVisibility,
} from "@brains/entity-service";
import { BaseJobHandler } from "@brains/job-queue";
import type { JobDataSchema } from "@brains/job-queue";
import type {
  BaseEntity,
  EntityMutationReceiptKey,
} from "@brains/entity-service";
import type { Logger } from "@brains/utils/logger";
import type { RetryScope } from "@brains/utils/retry-backoff";
import type { ProgressReporter } from "@brains/utils/progress";
import { isPlainRecord } from "@brains/utils/predicates";
import { getErrorMessage } from "@brains/utils/error";
import {
  generateMarkdown,
  parseMarkdown,
  updateFrontmatterField,
} from "@brains/utils/markdown";
import { FRONTMATTER_BLOCK } from "@brains/utils/markdown-frontmatter";
import {
  PROGRESS_STEPS,
  JobResult,
  imageGenerateJobContract,
  type GenerationResult,
} from "@brains/contracts";
import type { EntityPluginContext } from "../entity/context";

/**
 * Configuration for BaseGenerationJobHandler
 */
export interface GenerationJobHandlerConfig<TInput> {
  /** Zod schema for validating job input */
  schema: JobDataSchema<TInput>;
  /** Job type name for logging */
  jobTypeName: string;
  /** Entity type being generated (e.g., "post", "note", "deck") */
  entityType: string;
  /**
   * The owning plugin's retry scope (`this.retries`). A follow-up job the
   * queue refuses after the entity is created, such as its cover image, is
   * retried through it instead of failing the generation. Without it the
   * refusal fails the job.
   */
  retries?: RetryScope | undefined;
}

/**
 * Result of the generate step — the resolved content before entity creation.
 *
 * Subclasses return this from `generate()`. The base class handles
 * progress reporting, error wrapping, and entity creation.
 */
export interface GenericCoverImageRequest {
  generate?: boolean;
  prompt?: string;
}

interface NormalizedGenericCoverImageRequest {
  generate: true;
  prompt?: string;
}

function getPreallocatedEntityId(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("entityId" in data)) {
    return undefined;
  }
  const entityId = data.entityId;
  return typeof entityId === "string" && entityId.trim().length > 0
    ? entityId.trim()
    : undefined;
}

/** The entity a job's create committed, recorded in the create's own transaction. */
function createReceipt(jobId: string): EntityMutationReceiptKey {
  return { namespace: "generation.create", key: jobId };
}

/** The done-marker a job's follow-ups record once they have all run. */
function followUpsReceipt(jobId: string): EntityMutationReceiptKey {
  return { namespace: "generation.follow-ups", key: jobId };
}

/** What a generation is finished from: the entity it saved, if it still exists. */
interface SavedGeneration {
  entityId: string;
  generated: GeneratedContent | undefined;
}

function normalizeGenericCoverImageRequest(
  data: unknown,
): NormalizedGenericCoverImageRequest | undefined {
  if (!isPlainRecord(data) || !("coverImage" in data)) {
    return undefined;
  }

  const coverImage = data["coverImage"];
  if (coverImage === undefined || coverImage === false) return undefined;
  if (coverImage === true) return { generate: true };
  if (!isPlainRecord(coverImage)) return undefined;

  if (coverImage["generate"] === false) return undefined;
  const promptValue = coverImage["prompt"];
  const prompt =
    typeof promptValue === "string" ? promptValue.trim() : undefined;
  return {
    generate: true,
    ...(prompt && { prompt }),
  };
}

export interface GeneratedContent {
  /** Entity ID (often derived from title) */
  id: string;
  /** Markdown body, optionally with frontmatter */
  content: string;
  /** Entity metadata */
  metadata: Record<string, unknown>;
  /** Title for result reporting */
  title?: string;
  /** Extra fields merged into the success result (e.g., slug) */
  resultExtras?: Record<string, unknown>;
  /** Options passed to createEntity */
  createOptions?: { deduplicateId?: boolean };
  /**
   * The visibility to write the entity at. Unset, a new entity is public and
   * a pre-allocated stub keeps its own.
   */
  visibility?: ContentVisibility;
}

function withoutUndefined(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function withoutStubLifecycleFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...input };
  // Stub lifecycle fields are owned by the generation lifecycle, not by
  // durable user edits made while the stub is generating.
  delete result["status"];
  delete result["error"];
  return withoutUndefined(result);
}

/**
 * Abstract base class for content generation job handlers.
 *
 * Encapsulates the common flow shared by note, blog, deck, portfolio,
 * newsletter, and social-media generation handlers:
 *
 *   1. Report start
 *   2. Generate/resolve content (subclass)
 *   3. Create entity
 *   4. Post-creation hook (optional)
 *   5. Report done
 *
 * Subclasses implement `generate()` — the plugin-specific logic for
 * resolving content (AI generation, direct input, source entities, etc.).
 *
 * The base class owns:
 * - The try/catch + error result boilerplate
 * - Progress reporting at standard steps
 * - Entity creation via entityService
 * - Success/failure result construction
 *
 * @example
 * ```typescript
 * export class NoteGenerationHandler extends BaseGenerationJobHandler<NoteJobData> {
 *   constructor(logger: Logger, context: ServicePluginContext) {
 *     super(logger, context, {
 *       schema: noteJobSchema,
 *       jobTypeName: "note-generation",
 *       entityType: "note",
 *     });
 *   }
 *
 *   protected async generate(data: NoteJobData): Promise<GeneratedContent> {
 *     const generated = await this.context.ai.generate(
 *       { prompt: data.prompt, templateName: "note:generation" },
 *       z.object({ title: z.string(), body: z.string() }),
 *     );
 *     const title = data.title ?? generated.title;
 *     return {
 *       id: title,
 *       content: noteAdapter.createNoteContent(title, generated.body),
 *       metadata: { title },
 *       title,
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseGenerationJobHandler<
  TInput = unknown,
  TResult extends GenerationResult = GenerationResult,
> extends BaseJobHandler<string, TInput, TResult> {
  protected readonly context: EntityPluginContext;
  protected readonly entityType: string;
  private readonly retries: RetryScope | undefined;

  constructor(
    logger: Logger,
    context: EntityPluginContext,
    config: GenerationJobHandlerConfig<TInput>,
  ) {
    super(logger, {
      schema: config.schema,
      jobTypeName: config.jobTypeName,
    });
    this.context = context;
    this.entityType = config.entityType;
    this.retries = config.retries;
  }

  /**
   * Enqueue a follow-up job for an entity this generation created. The entity
   * exists by now, so a refusal (another process holding the job queue's
   * write lock) leaves the job pending in the plugin's retry scope, one retry
   * per `key`, and the generation succeeds.
   */
  protected async enqueueFollowUp(
    enqueue: () => Promise<string>,
    description: string,
    key: string,
  ): Promise<void> {
    if (!this.retries) {
      await enqueue();
      return;
    }
    await this.retries.run(enqueue, description, key);
  }

  /**
   * Generate or resolve content for entity creation.
   *
   * This is the only method subclasses must implement. It receives
   * the validated job data and a progress reporter, and returns
   * the content ready for entity creation.
   *
   * Progress reporting within generate() is optional — the base class
   * reports START before and SAVE/COMPLETE after.
   *
   * Throw via `this.failEarly(message)` for clean early returns.
   */
  protected abstract generate(
    data: TInput,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent>;

  /**
   * Hook called after successful entity creation.
   * Override for post-creation actions (e.g., queue image generation,
   * send messaging events).
   */
  protected async afterCreate(
    _data: TInput,
    _entityId: string,
    _progressReporter: ProgressReporter,
    _generated: GeneratedContent,
  ): Promise<void> {
    // Default: no-op
  }

  /**
   * Hook called when generation fails (either from failEarly or exceptions).
   * Override for failure notifications (e.g., messaging events).
   */
  protected async onGenerationFailure(
    _data: TInput,
    _error: string,
  ): Promise<void> {
    // Default: no-op
  }

  override validateAndParse(data: unknown): TInput | null {
    const parsed = super.validateAndParse(data);
    if (!parsed) return null;

    const coverImage = normalizeGenericCoverImageRequest(data);
    if (typeof parsed !== "object") {
      return parsed;
    }

    const entityId = getPreallocatedEntityId(data);
    if (!coverImage && !entityId) {
      return parsed;
    }

    Object.assign(parsed, {
      ...(coverImage && { coverImage }),
      ...(entityId && { entityId }),
    });
    return parsed;
  }

  async process(
    data: TInput,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<TResult> {
    try {
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.START,
        message: `Starting ${this.jobTypeName}`,
      });

      // A rerun of a job whose create committed (its attempt died, or a
      // follow-up failed and the queue retried it) finishes from that entity
      // instead of generating and creating a second one.
      const { entityId, generated } =
        (await this.savedByEarlierAttempt(data, jobId)) ??
        (await this.generateAndSave(data, jobId, progressReporter));

      // Step 3: Post-creation hooks, once per job. A committed entity
      // deleted before the rerun has nothing left to follow up.
      if (generated) {
        await this.followUpOnce(
          data,
          jobId,
          entityId,
          progressReporter,
          generated,
        );
      }

      // Step 4: Done
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: `${generated?.title ?? this.entityType} created successfully`,
      });

      return this.toResult({
        success: true,
        entityId,
        ...generated?.resultExtras,
      });
    } catch (error) {
      if (error instanceof GenerationFailure) {
        await this.markPreallocatedStubFailed(data, error.message);
        await this.onGenerationFailure(data, error.message);
        return this.toResult({ success: false, error: error.message });
      }

      const errorMessage = getErrorMessage(error);
      this.logger.error(`${this.jobTypeName} job failed`, {
        error,
        jobId,
        data: this.summarizeDataForLog(data),
      });

      await this.markPreallocatedStubFailed(data, errorMessage);
      await this.onGenerationFailure(data, errorMessage);
      return this.toResult(JobResult.failure(error));
    }
  }

  /**
   * The entity an earlier attempt of this job created, rebuilt as the
   * generation it saved. A job filling a pre-allocated stub has no create
   * to find: it updates the stub in place.
   */
  private async savedByEarlierAttempt(
    data: TInput,
    jobId: string,
  ): Promise<SavedGeneration | undefined> {
    if (getPreallocatedEntityId(data)) return undefined;
    const receipt = await this.context.entityService.getEntityMutationReceipt(
      createReceipt(jobId),
    );
    if (!receipt) return undefined;
    if (receipt.operation === "none") {
      throw new Error(`${this.jobTypeName} job ${jobId} recorded no entity`);
    }
    const entity = await this.context.entityService.getEntity({
      entityType: receipt.entityType,
      id: receipt.entityId,
      visibilityScope: internalFullScope(
        "a rerun generation job finishes from the entity it created",
      ),
    });
    return {
      entityId: receipt.entityId,
      generated: entity ? savedGeneration(entity) : undefined,
    };
  }

  /** Step 1 and 2: generate the content, then save it once for this job. */
  private async generateAndSave(
    data: TInput,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SavedGeneration> {
    // Step 1: Generate content (subclass logic)
    const generated = await this.generate(data, progressReporter);
    const preallocatedEntityId = getPreallocatedEntityId(data);
    const generatedForSave = preallocatedEntityId
      ? this.applyPreallocatedEntityId(preallocatedEntityId, generated)
      : generated;

    // Step 2: Create entity
    await this.reportProgress(progressReporter, {
      progress: PROGRESS_STEPS.SAVE,
      message: `Saving ${this.entityType} to database`,
    });

    const entityId = preallocatedEntityId
      ? (
          await this.updatePreallocatedStub(
            preallocatedEntityId,
            generatedForSave,
          )
        ).entityId
      : await this.createOnce(jobId, generatedForSave);
    return { entityId, generated: generatedForSave };
  }

  /**
   * Create the entity with this job's receipt in the same transaction, so a
   * rerun finds what it created rather than landing a duplicate beside it.
   */
  private async createOnce(
    jobId: string,
    generated: GeneratedContent,
  ): Promise<string> {
    const receipt = await this.context.entityService.applyEntityMutationOnce({
      receipt: createReceipt(jobId),
      operation: "create",
      request: {
        entity: {
          id: generated.id,
          entityType: this.entityType,
          content: generated.content,
          metadata: generated.metadata,
          ...(generated.visibility && { visibility: generated.visibility }),
        },
        ...(generated.createOptions && { options: generated.createOptions }),
      },
    });
    if (receipt.operation === "none") {
      throw new Error(`${this.jobTypeName} job ${jobId} recorded no entity`);
    }
    return receipt.entityId;
  }

  /**
   * Run the post-creation hooks unless this job already ran them all, then
   * mark them done. A kill between a follow-up and the mark reruns them;
   * a follow-up job queued with a key of its own is skipped while pending.
   */
  private async followUpOnce(
    data: TInput,
    jobId: string,
    entityId: string,
    progressReporter: ProgressReporter,
    generated: GeneratedContent,
  ): Promise<void> {
    const done = followUpsReceipt(jobId);
    if (await this.context.entityService.getEntityMutationReceipt(done)) {
      return;
    }
    await this.afterCreate(data, entityId, progressReporter, generated);
    await this.enqueueGenericCoverImageIfRequested(
      data,
      jobId,
      entityId,
      progressReporter,
      generated,
    );
    await this.context.entityService.applyEntityMutationOnce({
      receipt: done,
      operation: "none",
    });
  }

  /**
   * Widen a common generation result to the subclass's TResult.
   *
   * Irreducible here: TResult is chosen by the subclass, and its extra members
   * arrive through `resultExtras`, a Record<string, unknown>. TypeScript cannot
   * prove that spreading an untyped bag onto the shared fields reconstructs a
   * generic TResult. Eliminating it means moving result construction into each
   * subclass, where TResult is concrete — a change to the handler contract
   * across eight packages, not a local fix.
   */
  private toResult(result: GenerationResult): TResult {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the note above: irreducible without moving result construction into all eight subclasses
    return result as TResult;
  }

  private applyPreallocatedEntityId(
    entityId: string,
    generated: GeneratedContent,
  ): GeneratedContent {
    const metadata = { ...generated.metadata };
    let content = generated.content;
    let resultExtras = generated.resultExtras;

    if (typeof metadata["slug"] === "string") {
      metadata["slug"] = entityId;
      content = updateFrontmatterField(content, "slug", entityId);
      resultExtras = { ...resultExtras, slug: entityId };
    }

    return {
      ...generated,
      id: entityId,
      content,
      metadata,
      ...(resultExtras && { resultExtras }),
    };
  }

  private async updatePreallocatedStub(
    entityId: string,
    generated: GeneratedContent,
  ): Promise<{ entityId: string; jobId: string; skipped?: boolean }> {
    const existing = await this.context.entityService.getEntity({
      entityType: this.entityType,
      id: entityId,
      visibilityScope: internalFullScope(
        "pre-allocated generation stub update",
      ),
    });
    if (!existing) {
      throw new Error(
        `Pre-allocated entity stub not found: ${this.entityType}/${entityId}`,
      );
    }

    const merged = this.mergeStubWithGenerated(existing, generated);

    return this.context.entityService.updateEntity({
      entity: {
        ...existing,
        id: entityId,
        entityType: this.entityType,
        content: merged.content,
        metadata: merged.metadata,
        ...(generated.visibility && { visibility: generated.visibility }),
      },
    });
  }

  private mergeStubWithGenerated(
    existing: BaseEntity,
    generated: GeneratedContent,
  ): Pick<BaseEntity, "content" | "metadata"> {
    const existingFrontmatter = withoutStubLifecycleFields(
      parseMarkdown(existing.content).frontmatter,
    );
    const existingMetadata = withoutStubLifecycleFields(existing.metadata);
    const generatedMetadata = withoutUndefined(generated.metadata);
    const generatedParsed = parseMarkdown(generated.content);
    const generatedFrontmatter = withoutUndefined(generatedParsed.frontmatter);

    const mergedFrontmatter = withoutUndefined({
      ...existingFrontmatter,
      ...generatedMetadata,
      ...generatedFrontmatter,
    });
    const frontmatterSchema =
      this.context.entities.getEffectiveFrontmatterSchema(this.entityType);
    // Validate only — do NOT serialize the parsed result. A default z.object
    // strips unknown keys, which would drop the preserved attachment fields
    // (coverImageId, documents, future user-attached fields) that this merge
    // exists to keep. Serialize the un-parsed mergedFrontmatter below.
    frontmatterSchema?.parse(mergedFrontmatter);

    return {
      content: generateMarkdown(mergedFrontmatter, generatedParsed.content),
      metadata: {
        ...existingMetadata,
        ...generatedMetadata,
      },
    };
  }

  /**
   * The queue failed the job for good, possibly without process() settling
   * (its process died mid-attempt). A stub still generating would otherwise
   * stay generating forever; one already written is left alone.
   */
  async onTerminalError(error: Error, data: TInput): Promise<void> {
    await this.markPreallocatedStubFailed(data, error.message, {
      onlyWhileGenerating: true,
    });
  }

  private async markPreallocatedStubFailed(
    data: TInput,
    error: string,
    options: { onlyWhileGenerating?: boolean } = {},
  ): Promise<void> {
    const entityId = getPreallocatedEntityId(data);
    if (!entityId) return;

    try {
      const existing = await this.context.entityService.getEntity({
        entityType: this.entityType,
        id: entityId,
        visibilityScope: internalFullScope("mark generation stub failed"),
      });
      if (!existing) return;
      if (
        options.onlyWhileGenerating &&
        existing.metadata["status"] !== "generating"
      ) {
        return;
      }

      await this.context.entityService.updateEntity({
        entity: {
          ...existing,
          // A read that carries its document has the failure written there;
          // a declared type's read is its body, and its metadata carries it,
          // so the stored header keeps its order.
          content: FRONTMATTER_BLOCK.test(existing.content)
            ? updateFrontmatterField(
                updateFrontmatterField(existing.content, "status", "failed"),
                "error",
                error,
              )
            : existing.content,
          metadata: {
            ...existing.metadata,
            status: "failed",
            error,
          },
        },
      });
    } catch (failure) {
      this.logger.warn("Failed to mark generation stub as failed", {
        error: failure,
        entityId,
        entityType: this.entityType,
      });
    }
  }

  private async enqueueGenericCoverImageIfRequested(
    data: TInput,
    jobId: string,
    entityId: string,
    progressReporter: ProgressReporter,
    generated: GeneratedContent,
  ): Promise<void> {
    const coverImage = normalizeGenericCoverImageRequest(data);
    if (!coverImage) return;

    await this.reportProgress(progressReporter, {
      progress: 90,
      message: "Queueing cover image generation",
    });

    const title = generated.title ?? entityId;
    await this.enqueueFollowUp(
      () =>
        this.context.jobs.enqueue(
          imageGenerateJobContract,
          {
            prompt:
              coverImage.prompt ?? `Editorial cover image for: ${title}. `,
            title: `${title} Cover`,
            aspectRatio: "16:9",
            targetEntityType: this.entityType,
            targetEntityId: entityId,
            entityTitle: title,
            entityContent: generated.content,
          },
          {
            toolContext: {
              interfaceType: "job",
              actor: { kind: "service", serviceId: "generation-job-handler" },
            },
            // A rerun of this job queues no second cover while one waits.
            options: {
              source: "generation-job-handler",
              metadata: { operationType: "data_processing" },
              deduplication: "skip",
              deduplicationKey: `${jobId}:cover-image`,
            },
          },
        ),
      `queue the cover image for ${this.entityType}:${entityId}`,
      `cover-image:${this.entityType}:${entityId}`,
    );
  }

  /**
   * Signal an early failure from within `generate()`.
   * Produces a clean `{ success: false, error }` result without logging an error.
   */
  protected failEarly(message: string): never {
    throw new GenerationFailure(message);
  }
}

/**
 * A committed entity read back as the generation that saved it: its title
 * and slug, where its metadata carries them, are what the result reported.
 */
function savedGeneration(entity: BaseEntity): GeneratedContent {
  const title = entity.metadata["title"];
  const slug = entity.metadata["slug"];
  const resultExtras = withoutUndefined({
    title: typeof title === "string" ? title : undefined,
    slug: typeof slug === "string" ? slug : undefined,
  });
  return {
    id: entity.id,
    content: entity.content,
    metadata: entity.metadata,
    ...(typeof title === "string" && { title }),
    ...(Object.keys(resultExtras).length > 0 && { resultExtras }),
  };
}

/**
 * Internal error type for clean early failures (not logged as errors).
 */
class GenerationFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationFailure";
  }
}
