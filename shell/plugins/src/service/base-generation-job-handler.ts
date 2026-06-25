import { BaseJobHandler } from "@brains/job-queue";
import type { JobDataSchema } from "@brains/job-queue";
import type { BaseEntity } from "@brains/entity-service";
import type { Logger, ProgressReporter } from "@brains/utils";
import {
  generateMarkdown,
  getErrorMessage,
  parseMarkdown,
  updateFrontmatterField,
} from "@brains/utils";
import {
  PROGRESS_STEPS,
  JobResult,
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

function normalizeGenericCoverImageRequest(
  data: unknown,
): NormalizedGenericCoverImageRequest | undefined {
  if (typeof data !== "object" || data === null || !("coverImage" in data)) {
    return undefined;
  }

  const coverImage = (data as { coverImage?: unknown }).coverImage;
  if (coverImage === undefined || coverImage === false) return undefined;
  if (coverImage === true) return { generate: true };
  if (typeof coverImage !== "object" || coverImage === null) return undefined;

  const request = coverImage as GenericCoverImageRequest;
  if (request.generate === false) return undefined;
  const prompt = request.prompt?.trim();
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
 *     const generated = await this.context.ai.generate<{ title: string; body: string }>({
 *       prompt: data.prompt,
 *       templateName: "note:generation",
 *     });
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

      const result = preallocatedEntityId
        ? await this.updatePreallocatedStub(
            preallocatedEntityId,
            generatedForSave,
          )
        : await this.context.entityService.createEntity({
            entity: {
              id: generatedForSave.id,
              entityType: this.entityType,
              content: generatedForSave.content,
              metadata: generatedForSave.metadata,
            },
            options: generatedForSave.createOptions,
          });

      // Step 3: Post-creation hook
      await this.afterCreate(
        data,
        result.entityId,
        progressReporter,
        generatedForSave,
      );
      await this.enqueueGenericCoverImageIfRequested(
        data,
        result.entityId,
        progressReporter,
        generatedForSave,
      );

      // Step 4: Done
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: `${generatedForSave.title ?? this.entityType} created successfully`,
      });

      return {
        success: true,
        entityId: result.entityId,
        ...generatedForSave.resultExtras,
      } as TResult;
    } catch (error) {
      if (error instanceof GenerationFailure) {
        await this.markPreallocatedStubFailed(data, error.message);
        await this.onGenerationFailure(data, error.message);
        return { success: false, error: error.message } as TResult;
      }

      const errorMessage = getErrorMessage(error);
      this.logger.error(`${this.jobTypeName} job failed`, {
        error,
        jobId,
        data: this.summarizeDataForLog(data),
      });

      await this.markPreallocatedStubFailed(data, errorMessage);
      await this.onGenerationFailure(data, errorMessage);
      return JobResult.failure(error) as TResult;
    }
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
      visibilityScope: "restricted",
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

  private async markPreallocatedStubFailed(
    data: TInput,
    error: string,
  ): Promise<void> {
    const entityId = getPreallocatedEntityId(data);
    if (!entityId) return;

    try {
      const existing = await this.context.entityService.getEntity({
        entityType: this.entityType,
        id: entityId,
        visibilityScope: "restricted",
      });
      if (!existing) return;

      await this.context.entityService.updateEntity({
        entity: {
          ...existing,
          content: updateFrontmatterField(
            updateFrontmatterField(existing.content, "status", "failed"),
            "error",
            error,
          ),
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
    await this.context.jobs.enqueue({
      type: "image:image-generate",
      data: {
        prompt: coverImage.prompt ?? `Editorial cover image for: ${title}. `,
        title: `${title} Cover`,
        aspectRatio: "16:9",
        targetEntityType: this.entityType,
        targetEntityId: entityId,
        entityTitle: title,
        entityContent: generated.content,
      },
      toolContext: { interfaceType: "job", userId: "system" },
    });
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
 * Internal error type for clean early failures (not logged as errors).
 */
class GenerationFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationFailure";
  }
}
