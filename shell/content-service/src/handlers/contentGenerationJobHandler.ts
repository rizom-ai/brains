import { ConsoleLogger, type Logger } from "@brains/utils/logger";
import type { ContentService } from "../types";
import {
  contentGenerationJobDataSchema,
  type ContentGenerationJobData,
} from "../generation-contracts";
import { NonRetryableJobError, type JobHandler } from "@brains/job-queue";
import { AIOutputValidationError } from "@brains/ai-service";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import {
  assertEntityWriteReceiptMatches,
  EntityWriteConflictError,
  EntityWriteIntentMismatchError,
  EntityValidationError,
  type BaseEntity,
  type IEntityService,
} from "@brains/entity-service";
import type { ProgressReporter } from "@brains/utils/progress";
import { GenerationAuthorizationError } from "../generation-authorization";

interface GeneratedOutput {
  entityType: string;
  entityId: string;
}

/** Generates independent targets; the entity service owns atomic admission/recovery. */
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

  /** A committed receipt survives edits/deletes and must be checked before any AI call. */
  private async committedOutput(
    data: ContentGenerationJobData,
  ): Promise<GeneratedOutput | null> {
    const receipt = await this.entityService.getEntityWriteReceipt(
      data.operationId,
    );
    if (!receipt) return null;
    assertEntityWriteReceiptMatches(receipt, {
      operationId: data.operationId,
      expectedRevision: data.expectedRevision,
      entityType: data.destination.entityType,
      entityId: data.destination.entityId,
    });
    return { entityType: receipt.entityType, entityId: receipt.entityId };
  }

  public async process(
    data: ContentGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
    signal?: AbortSignal,
  ): Promise<GeneratedOutput> {
    try {
      signal?.throwIfAborted();
      const committed = await this.committedOutput(data);
      signal?.throwIfAborted();
      if (committed) return committed;
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
        // Another attempt of this same operation may have committed between
        // the receipt lookup and snapshot read. Recover rather than conflict.
        const completed = await this.committedOutput(data);
        signal?.throwIfAborted();
        if (completed) return completed;
        throw new EntityWriteConflictError(
          destination.entityType,
          destination.entityId,
        );
      }

      const template = this.contentService.getTemplate(data.templateName);
      if (!template?.dataSourceId || !template.formatter) {
        throw new NonRetryableJobError(
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
        throw new NonRetryableJobError(
          getErrorMessage(error, "Content formatting failed"),
          { cause: error },
        );
      }
      signal?.throwIfAborted();
      const options = {
        // Second and final resolution: revocation here must block persistence.
        beforeWrite: async (entity: Readonly<BaseEntity>): Promise<void> => {
          signal?.throwIfAborted();
          await this.contentService.authorizeGenerationWrite(data, entity);
        },
        ...(signal && { signal }),
        conditionalWrite: {
          operationId: data.operationId,
          expectedRevision: data.expectedRevision,
        },
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
      await progressReporter.report({
        progress: 3,
        total: 3,
        message: `Completed content generation for: ${data.templateName}`,
      });
      // Only advertise persistence after the atomic entity/receipt commit.
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
      // Deterministic failures must not spend the queue's transient retry budget.
      if (
        error instanceof GenerationAuthorizationError ||
        error instanceof EntityWriteConflictError ||
        error instanceof EntityWriteIntentMismatchError ||
        error instanceof EntityValidationError ||
        error instanceof z.ZodError ||
        error instanceof AIOutputValidationError
      ) {
        throw new NonRetryableJobError(error.message, { cause: error });
      }
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
