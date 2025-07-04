import type { Logger } from "@brains/types";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type {
  SiteContent,
  SiteContentEntityType,
  DeriveOptions,
  DeriveResult,
} from "../types";

/**
 * Content derivation operations
 * Handles content transformation between entity types (preview ↔ production)
 */
export class DerivationOperations {
  private static instance: DerivationOperations | null = null;

  // Singleton access
  public static getInstance(
    entityService: EntityService,
    logger: Logger,
  ): DerivationOperations {
    DerivationOperations.instance ??= new DerivationOperations(
      entityService,
      logger,
    );
    return DerivationOperations.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    DerivationOperations.instance = null;
  }

  // Isolated instance creation
  public static createFresh(
    entityService: EntityService,
    logger: Logger,
  ): DerivationOperations {
    return new DerivationOperations(entityService, logger);
  }

  // Private constructor to enforce factory methods
  private constructor(
    private readonly entityService: EntityService,
    private readonly logger: Logger,
  ) {}

  /**
   * Derive content synchronously (blocks until complete)
   */
  async deriveSync(
    sourceEntityId: string,
    sourceEntityType: SiteContentEntityType,
    targetEntityType: SiteContentEntityType,
    options: DeriveOptions = {},
  ): Promise<DeriveResult> {
    this.logger.info("Starting content derivation", {
      sourceEntityId,
      sourceEntityType,
      targetEntityType,
      options,
    });

    try {
      // Use EntityService's deriveEntity method directly
      const derivedEntity = await this.entityService.deriveEntity<SiteContent>(
        sourceEntityId,
        sourceEntityType,
        targetEntityType,
        options,
      );

      const result: DeriveResult = {
        sourceEntityId,
        sourceEntityType,
        derivedEntityId: derivedEntity.id,
        derivedEntityType: targetEntityType,
        sourceDeleted: options.deleteSource ?? false,
      };

      this.logger.info("Content derivation completed", result);
      return result;
    } catch (error) {
      const errorMessage = `Content derivation failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error("Content derivation failed", {
        sourceEntityId,
        sourceEntityType,
        targetEntityType,
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }
  }

  /**
   * Derive content asynchronously (queues jobs and returns immediately)
   * Future enhancement: Could queue derivation jobs for batch processing
   */
  async deriveAsync(
    sourceEntityId: string,
    sourceEntityType: SiteContentEntityType,
    targetEntityType: SiteContentEntityType,
    options: DeriveOptions = {},
  ): Promise<{ jobId: string }> {
    this.logger.info("Starting async content derivation", {
      sourceEntityId,
      sourceEntityType,
      targetEntityType,
      options,
    });

    // For now, we'll execute synchronously but return a job-like interface
    // In the future, this could be enhanced to use actual job queuing
    const jobId = `derive-${sourceEntityId}-${targetEntityType}-${Date.now()}`;

    // Execute the derivation in the background (don't await)
    this.executeDerivatonJob(
      jobId,
      sourceEntityId,
      sourceEntityType,
      targetEntityType,
      options,
    ).catch((error) => {
      this.logger.error("Async derivation job failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { jobId };
  }

  /**
   * Execute a derivation job (private helper for async operations)
   */
  private async executeDerivatonJob(
    jobId: string,
    sourceEntityId: string,
    sourceEntityType: SiteContentEntityType,
    targetEntityType: SiteContentEntityType,
    options: DeriveOptions,
  ): Promise<void> {
    this.logger.debug("Executing derivation job", { jobId });

    try {
      await this.deriveSync(
        sourceEntityId,
        sourceEntityType,
        targetEntityType,
        options,
      );

      this.logger.info("Derivation job completed", { jobId });
    } catch (error) {
      this.logger.error("Derivation job failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
