import { ConsoleLogger, type Logger } from "@brains/utils/logger";
import type { ContentService } from "../types";
import {
  contentGenerationJobDataSchema,
  type ContentGenerationJobData,
} from "../generation-contracts";
import type { JobHandler } from "@brains/job-queue";
import { getErrorMessage } from "@brains/utils/error";
import {
  EntityWriteConflictError,
  type BaseEntity,
  type IEntityService,
} from "@brains/entity-service";
import type { ProgressReporter } from "@brains/utils/progress";

interface GeneratedOutput {
  entityType: string;
  entityId: string;
}

/**
 * Generates independent targets; the entity service owns atomic admission.
 *
 * Jobs run at most once: they are enqueued without retries, and nothing here
 * throws after the entity commit. So a failed job wrote nothing, and an
 * interrupted worker leaves a failed job rather than re-running against output
 * that may already exist. Re-submitting plans afresh and skips existing output.
 */
export class ContentGenerationJobHandler implements JobHandler<"content-generation"> {
  private logger: Logger;
  private contentService: ContentService;
  private entityService: IEntityService;

  public static createFresh(
    contentService: ContentService,
    entityService: IEntityService,
  ): ContentGenerationJobHandler {
    return new ContentGenerationJobHandler(contentService, entityService);
  }

  private constructor(
    contentService: ContentService,
    entityService: IEntityService,
  ) {
    this.logger = ConsoleLogger.getInstance().child(
      "ContentGenerationJobHandler",
    );
    this.contentService = contentService;
    this.entityService = entityService;
  }

  public async process(
    data: ContentGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
    signal?: AbortSignal,
  ): Promise<GeneratedOutput> {
    try {
      signal?.throwIfAborted();
      const { destination } = data;
      // First of two authority resolutions; the second guards the entity write.
      await this.contentService.authorizeGenerationWrite(data);
      signal?.throwIfAborted();
      const snapshot = await this.entityService.getEntityWriteSnapshot({
        entityType: destination.entityType,
        id: destination.entityId,
        visibilityScope: destination.visibility,
      });
      signal?.throwIfAborted();
      if (
        (snapshot?.revision ?? null) !== data.expectedRevision ||
        (snapshot && snapshot.entity.visibility !== destination.visibility)
      ) {
        // Includes a retry of an attempt that committed before the queue was
        // acknowledged: the output exists, so fail terminally rather than
        // regenerate it. No AI call has been made yet.
        throw new EntityWriteConflictError(
          destination.entityType,
          destination.entityId,
        );
      }

      const template = this.contentService.getTemplate(data.templateName);
      if (!template?.dataSourceId || !template.formatter) {
        throw new Error(
          `Generation template is unavailable or incomplete: ${data.templateName}`,
        );
      }
      await progressReporter.report({
        progress: 0,
        total: 3,
        message: `Generating content with template: ${data.templateName}`,
      });
      signal?.throwIfAborted();
      const content = await this.contentService.generateContent(
        data.templateName,
        data.context,
        { ...(signal && { signal }), visibilityScope: destination.visibility },
      );
      signal?.throwIfAborted();
      await progressReporter.report({
        progress: 1,
        total: 3,
        message: `Formatting content for template: ${data.templateName}`,
      });
      signal?.throwIfAborted();
      let formattedContent: string;
      try {
        formattedContent = this.contentService.formatContent(
          data.templateName,
          content,
        );
      } catch (error) {
        throw new Error(getErrorMessage(error, "Content formatting failed"), {
          cause: error,
        });
      }
      signal?.throwIfAborted();
      const options = {
        // Second and final resolution: revocation here must block persistence.
        beforeWrite: async (entity: Readonly<BaseEntity>): Promise<void> => {
          signal?.throwIfAborted();
          await this.contentService.authorizeGenerationWrite(data, entity);
        },
        ...(signal && { signal }),
        conditionalWrite: { expectedRevision: data.expectedRevision },
      };
      if (snapshot) {
        await this.entityService.updateEntity({
          entity: {
            ...snapshot.entity,
            content: formattedContent,
            metadata: destination.metadata,
          },
          options,
        });
      } else {
        await this.entityService.createEntity({
          entity: {
            id: destination.entityId,
            entityType: destination.entityType,
            content: formattedContent,
            metadata: destination.metadata,
            visibility: destination.visibility,
          },
          options,
        });
      }
      // The write is committed. Reporting is best-effort from here: a failure
      // would make the queue retry-or-fail a job whose output already exists.
      try {
        await progressReporter.report({
          progress: 3,
          total: 3,
          message: `Completed content generation for: ${data.templateName}`,
        });
      } catch (error) {
        this.logger.warn("Completion report failed after commit", {
          jobId,
          error,
        });
      }
      return {
        entityType: destination.entityType,
        entityId: destination.entityId,
      };
    } catch (error) {
      signal?.throwIfAborted();
      this.logger.error("Content generation job failed", {
        jobId,
        templateName: data.templateName,
        error,
      });
      // Resolving an error object would incorrectly acknowledge queue success.
      throw error;
    }
  }

  /** The schema's preprocessor owns the payload limits; oversized data is invalid. */
  public validateAndParse(data: unknown): ContentGenerationJobData | null {
    const parsed = contentGenerationJobDataSchema.safeParse(data);
    if (!parsed.success) {
      this.logger.warn("Invalid content generation job data", {
        validationError: parsed.error.issues,
      });
      return null;
    }
    return parsed.data;
  }
}
