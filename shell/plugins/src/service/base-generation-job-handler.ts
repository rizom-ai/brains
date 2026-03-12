import { BaseJobHandler } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import {
  z,
  PROGRESS_STEPS,
  JobResult,
  type GenerationResult,
} from "@brains/utils";
import type { ServicePluginContext } from "./context";

/**
 * Configuration for BaseGenerationJobHandler
 */
export interface GenerationJobHandlerConfig<TInput> {
  /** Zod schema for validating job input */
  schema: z.ZodSchema<TInput>;
  /** Job type name for logging */
  jobTypeName: string;
  /** Entity type being generated (e.g., "post", "base", "deck") */
  entityType: string;
}

/**
 * Result of the generate step — the resolved content before entity creation.
 *
 * Subclasses return this from `generate()`. The base class handles
 * progress reporting, error wrapping, and entity creation.
 */
export interface GeneratedContent {
  /** Entity ID (often derived from title) */
  id: string;
  /** Full markdown content (with frontmatter) */
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
 *       entityType: "base",
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
  protected readonly context: ServicePluginContext;
  protected readonly entityType: string;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
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

      // Step 2: Create entity
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.SAVE,
        message: `Saving ${this.entityType} to database`,
      });

      const result = await this.context.entityService.createEntity(
        {
          id: generated.id,
          entityType: this.entityType,
          content: generated.content,
          metadata: generated.metadata,
        },
        generated.createOptions,
      );

      // Step 3: Post-creation hook
      await this.afterCreate(data, result.entityId, progressReporter);

      // Step 4: Done
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: `${generated.title ?? this.entityType} created successfully`,
      });

      return {
        success: true,
        entityId: result.entityId,
        ...generated.resultExtras,
      } as TResult;
    } catch (error) {
      if (error instanceof GenerationFailure) {
        await this.onGenerationFailure(data, error.message);
        return { success: false, error: error.message } as TResult;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`${this.jobTypeName} job failed`, {
        error,
        jobId,
        data: this.summarizeDataForLog(data),
      });

      await this.onGenerationFailure(data, errorMessage);
      return JobResult.failure(error) as TResult;
    }
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
