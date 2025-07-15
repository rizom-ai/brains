import type { Logger } from "@brains/utils";
import type { EntityService } from "@brains/entity-service";
import type { SiteContentEntityType } from "@brains/view-registry";
import type { DeriveOptions } from "../types";

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
    _entityService: EntityService, // TODO: Use when implementing actual async derivation
    private readonly logger: Logger,
  ) {}

  /**
   * Derive content (queues jobs and returns immediately)
   * Future enhancement: Could queue derivation jobs for batch processing
   */
  async derive(
    sourceEntityId: string,
    sourceEntityType: SiteContentEntityType,
    targetEntityType: SiteContentEntityType,
    options: DeriveOptions = {},
  ): Promise<{ jobId: string }> {
    this.logger.info("Content derivation queued", {
      sourceEntityId,
      sourceEntityType,
      targetEntityType,
      options,
    });

    // TODO: Implement async derivation with job queue
    // For now, return a mock job ID
    const jobId = `derive-${sourceEntityId}-${Date.now()}`;

    return { jobId };
  }
}
