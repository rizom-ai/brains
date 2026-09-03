import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  PermanentJobEnqueueError,
  type IJobQueueService,
  type JobQueueEnqueueRequest,
} from "@brains/job-queue";
import {
  createMockJobQueueService,
  createSilentLogger,
} from "@brains/test-utils";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { createTestEntityDatabase } from "./helpers/test-entity-db";
import {
  createNoteInput,
  noteAdapter,
  noteSchema,
} from "./helpers/test-schemas";
import { mockEmbeddingService } from "./helpers/mock-services";

interface TestService {
  service: EntityService;
  queue: IJobQueueService;
}

const cleanups: Array<() => Promise<void>> = [];
const services: EntityService[] = [];

afterEach(async () => {
  for (const service of services.splice(0).reverse()) {
    await service.waitForJobOutboxIdle();
    service.close();
  }
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function createService(
  queue: IJobQueueService = createMockJobQueueService(),
): Promise<TestService> {
  const testDatabase = await createTestEntityDatabase();
  cleanups.push(testDatabase.cleanup);
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("note", noteSchema, noteAdapter);
  const service = EntityService.createFresh({
    embeddingService: mockEmbeddingService,
    entityRegistry: registry,
    logger,
    jobQueueService: queue,
    dbConfig: testDatabase.config,
  });
  services.push(service);
  await service.initialize();
  return { service, queue };
}

describe("entity embedding job outbox", () => {
  test("commits a durable intent when the job database is unavailable", async () => {
    const queue = createMockJobQueueService();
    let available = false;
    const admitted = new Set<string>();
    queue.enqueue = mock(async (request: JobQueueEnqueueRequest) => {
      if (!available) throw new Error("injected queue outage");
      const jobId = request.idempotencyKey;
      if (!jobId) throw new Error("Expected a stable idempotency key");
      admitted.add(jobId);
      return jobId;
    });
    const { service } = await createService(queue);

    const result = await service.createEntity({
      entity: createNoteInput(
        { title: "Durable intent", content: "Persist me", tags: [] },
        "durable-intent",
      ),
    });

    const outage = await service
      .flushJobOutbox()
      .catch((error: unknown) => error);
    expect(outage).toBeInstanceOf(Error);
    if (!(outage instanceof Error)) throw outage;
    expect(outage.message).toBe("injected queue outage");
    expect(await service.getPendingJobOutboxCount()).toBe(1);
    expect(
      await service.getEntity({ entityType: "note", id: "durable-intent" }),
    ).not.toBeNull();

    available = true;
    expect(await service.flushJobOutbox()).toBe(1);
    expect(await service.getPendingJobOutboxCount()).toBe(0);
    expect(admitted).toEqual(new Set([result.jobId]));
  });

  test("parks a poisoned head row and continues with later intents", async () => {
    const queue = createMockJobQueueService();
    const delivered: string[] = [];
    queue.enqueue = mock(async (request: JobQueueEnqueueRequest) => {
      const data = request.data as { id?: string };
      if (data.id === "poisoned") {
        throw new PermanentJobEnqueueError("handler removed during upgrade");
      }
      if (!request.idempotencyKey) {
        throw new Error("Expected a stable idempotency key");
      }
      delivered.push(data.id ?? "");
      return request.idempotencyKey;
    });
    const { service } = await createService(queue);

    await service.createEntity({
      entity: createNoteInput(
        { title: "Poisoned", content: "cannot deliver", tags: [] },
        "poisoned",
      ),
    });
    await service.createEntity({
      entity: createNoteInput(
        { title: "Healthy", content: "deliver me", tags: [] },
        "healthy",
      ),
    });
    await service.waitForJobOutboxIdle();
    await service.flushJobOutbox();

    expect(delivered).toContain("healthy");
    expect(await service.getPendingJobOutboxCount()).toBe(0);
  });

  test("replays exactly once after interruption between enqueue and acknowledgement", async () => {
    const testDatabase = await createTestEntityDatabase();
    cleanups.push(testDatabase.cleanup);
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType("note", noteSchema, noteAdapter);
    const queue = createMockJobQueueService();
    const durableEnqueue = queue.enqueue.bind(queue);
    let signalEnqueueStarted = (): void => {};
    const enqueueStarted = new Promise<void>((resolve) => {
      signalEnqueueStarted = resolve;
    });
    let releaseEnqueue = (): void => {};
    const enqueueGate = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    queue.enqueue = mock(async (request: JobQueueEnqueueRequest) => {
      const jobId = await durableEnqueue(request);
      signalEnqueueStarted();
      await enqueueGate;
      return jobId;
    });

    const first = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry: registry,
      logger,
      jobQueueService: queue,
      dbConfig: testDatabase.config,
    });
    await first.initialize();
    const result = await first.createEntity({
      entity: createNoteInput(
        { title: "Interrupted relay", content: "Replay me", tags: [] },
        "interrupted-relay",
      ),
    });
    await enqueueStarted;

    first.close();
    releaseEnqueue();
    await first.waitForJobOutboxIdle();

    const recovered = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry: registry,
      logger,
      jobQueueService: queue,
      dbConfig: testDatabase.config,
    });
    services.push(recovered);
    await recovered.initialize();

    expect(await recovered.getPendingJobOutboxCount()).toBe(0);
    expect((await queue.getActiveJobs()).map((job) => job.id)).toEqual([
      result.jobId,
    ]);
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });
});
