import { EntityService } from "../../src/entityService";
import { EntityRegistry } from "../../src/entityRegistry";
import {
  createSilentLogger,
  createMockJobQueueService,
} from "@brains/test-utils";
import type { IJobQueueService } from "@brains/job-queue";
import type {
  EntityDbConfig,
  EntityAdapter,
  BaseEntity,
} from "../../src/types";
import type { z } from "@brains/utils";
import { mockEmbeddingService } from "./mock-services";
import { createTestEntityDatabase } from "./test-entity-db";

export interface EntityServiceTestContext {
  entityService: EntityService;
  entityRegistry: EntityRegistry;
  jobQueueService: IJobQueueService;
  dbConfig: EntityDbConfig;
  cleanup: () => Promise<void>;
}

interface EntityTypeRegistration {
  name: string;
  schema: z.ZodType<unknown>;
  adapter: EntityAdapter<BaseEntity>;
  config?: { weight?: number; embeddable?: boolean };
}

/**
 * Create a fully wired EntityService with a temporary on-disk database,
 * suitable for integration-style tests that need real persistence.
 *
 * Handles: singleton resets, test DB creation, logger, job queue mock,
 * entity type registration, and cleanup.
 */
export async function setupEntityService(
  registrations: EntityTypeRegistration[],
): Promise<EntityServiceTestContext> {
  EntityService.resetInstance();
  EntityRegistry.resetInstance();

  const testDb = await createTestEntityDatabase();
  const logger = createSilentLogger();
  const entityRegistry = EntityRegistry.createFresh(logger);
  const mockJobQueueService = createMockJobQueueService({
    returns: { enqueue: "mock-job-id" },
  });

  for (const reg of registrations) {
    entityRegistry.registerEntityType(
      reg.name,
      reg.schema,
      reg.adapter,
      reg.config,
    );
  }

  const entityService = EntityService.createFresh({
    embeddingService: mockEmbeddingService,
    entityRegistry,
    logger,
    jobQueueService: mockJobQueueService,
    dbConfig: testDb.config,
  });

  const cleanup = async (): Promise<void> => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();
    await testDb.cleanup();
  };

  return {
    entityService,
    entityRegistry,
    jobQueueService: mockJobQueueService,
    dbConfig: testDb.config,
    cleanup,
  };
}
