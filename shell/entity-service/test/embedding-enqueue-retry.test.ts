import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createMockJobQueueService } from "@brains/job-queue/test";
import type { JobQueueEnqueueRequest } from "@brains/job-queue";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { createTestEntity } from "../src/test/index";
import { mockEmbeddingService } from "./helpers/mock-services";
import { createTestEntityDatabase } from "./helpers/test-entity-db";
import {
  noteAdapter,
  noteSchema,
  createNoteInput,
  type Note,
} from "./helpers/test-schemas";

const embeddingJobSchema = z.object({
  data: z.object({ id: z.string(), contentHash: z.string() }),
});

/**
 * The job queue refuses an enqueue while another process holds its write
 * lock past the enqueue budget. By then the entity is committed, so a dropped
 * embedding job left it unsearchable until the next startup backfill.
 */
describe("EntityService embedding enqueues the queue refuses", () => {
  let entityService: EntityService;
  let cleanup: () => Promise<void>;
  const queue: { refusing: boolean; admitted: string[] } = {
    refusing: false,
    admitted: [],
  };
  const enqueue = mock(async (request: JobQueueEnqueueRequest) => {
    if (queue.refusing) {
      throw new Error("Failed to acquire atomic enqueue transaction");
    }
    queue.admitted.push(embeddingJobSchema.parse(request).data.contentHash);
    return `job-${queue.admitted.length}`;
  });

  /** Content hashes of the embedding jobs the queue admitted, in order. */
  function admittedHashes(): string[] {
    return queue.admitted;
  }

  beforeEach(async () => {
    queue.refusing = false;
    queue.admitted = [];
    enqueue.mockClear();
    const testDb = await createTestEntityDatabase();
    cleanup = testDb.cleanup;
    const logger = createSilentLogger();
    const entityRegistry = EntityRegistry.createFresh(logger);
    entityRegistry.registerEntityType("note", noteSchema, noteAdapter);
    const jobQueueService = createMockJobQueueService();
    jobQueueService.enqueue = enqueue;
    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService,
      dbConfig: testDb.config,
      embeddingDbConfig: testDb.embeddingConfig,
    });
  });

  afterEach(async () => {
    entityService.close();
    await cleanup();
  });

  function note(content: string): Note {
    return createTestEntity<Note>(
      "note",
      createNoteInput({ title: "Note", content, tags: [] }, "note-1"),
    );
  }

  test("resolves the mutation and queues its embedding once the queue admits it", async () => {
    queue.refusing = true;

    const result = await entityService.createEntity({
      entity: note("first"),
    });
    expect(result).toEqual({ entityId: "note-1", jobId: "", skipped: false });
    expect(enqueue).toHaveBeenCalledTimes(1);

    queue.refusing = false;
    await waitUntil(
      () => admittedHashes().length === 1,
      "the refused embedding to be queued",
      { timeoutMs: 5_000 },
    );
    const stored = await entityService.getEntity({
      entityType: "note",
      id: "note-1",
    });
    expect(admittedHashes()).toEqual([stored?.contentHash ?? ""]);
  });

  test("retries only the latest content of an entity", async () => {
    queue.refusing = true;
    await entityService.createEntity({ entity: note("first") });
    await entityService.updateEntity({ entity: note("second") });
    queue.refusing = false;

    await waitUntil(
      () => admittedHashes().length === 1,
      "the latest embedding to be queued",
      { timeoutMs: 5_000 },
    );
    await Bun.sleep(1_500);

    const stored = await entityService.getEntity({
      entityType: "note",
      id: "note-1",
    });
    expect(admittedHashes()).toEqual([stored?.contentHash ?? ""]);
  });

  test("drops a pending retry once a newer embedding is queued", async () => {
    queue.refusing = true;
    await entityService.createEntity({ entity: note("first") });
    queue.refusing = false;
    await entityService.updateEntity({ entity: note("second") });

    await Bun.sleep(1_500);

    const stored = await entityService.getEntity({
      entityType: "note",
      id: "note-1",
    });
    expect(admittedHashes()).toEqual([stored?.contentHash ?? ""]);
  });

  test("stops retrying when the entity service closes", async () => {
    queue.refusing = true;
    await entityService.createEntity({ entity: note("first") });

    entityService.close();
    queue.refusing = false;
    await Bun.sleep(1_500);

    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
