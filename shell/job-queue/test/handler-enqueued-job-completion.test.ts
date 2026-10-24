import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { JOB_CHANNELS } from "@brains/contracts";
import { MessageBus } from "@brains/messaging-service";
import { OperationContext } from "@brains/operation-context";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { BatchJobManager } from "../src/batch-job-manager";
import { JobProgressMonitor } from "../src/job-progress-monitor";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler } from "../src/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";

const handler: JobHandler<"shell:embedding"> = {
  process: async () => ({}),
  validateAndParse: (data: unknown) =>
    z.object({ id: z.string() }).loose().parse(data),
  onError: async () => {},
};

/**
 * A job an event handler enqueues runs inside the event's operation, the way
 * a wake-up on a stored chat message enqueues its pickup. Whether its
 * completion is published decides whether anything can react to it.
 */
describe("the completion of a job an event handler enqueued", () => {
  let cleanup: () => Promise<void>;
  let service: JobQueueService;
  let messageBus: MessageBus;
  let monitor: JobProgressMonitor;
  let completed: string[];

  beforeEach(async () => {
    const db = await createTestJobQueueDatabase();
    cleanup = db.cleanup;
    const logger = createSilentLogger();
    const operationContext = OperationContext.createFresh();
    messageBus = MessageBus.createFresh(logger, operationContext);
    service = JobQueueService.createFresh(db.config, logger, {
      operationContext,
    });
    service.registerHandler("shell:embedding", handler);
    monitor = JobProgressMonitor.createFresh(
      service,
      messageBus,
      BatchJobManager.createFresh(service, logger),
      logger,
      "combined",
    );
    completed = [];
    messageBus.subscribe(JOB_CHANNELS.progress, async (message) => {
      const event = z
        .object({ id: z.string(), status: z.string() })
        .loose()
        .parse(message.payload);
      if (event.status === "completed") completed.push(event.id);
      return { success: true };
    });
  });

  afterEach(async () => {
    service.close();
    await cleanup();
  });

  async function enqueueOnEvent(detached: boolean): Promise<string> {
    const enqueued: string[] = [];
    messageBus.subscribe("test:message-added", async () => {
      enqueued.push(
        await service.enqueue({
          type: "shell:embedding",
          data: { id: "note-1" },
          options: {
            source: "test",
            metadata: { operationType: "data_processing" },
            ...(detached ? { detached } : {}),
          },
        }),
      );
      return { success: true };
    });
    await messageBus.send({
      type: "test:message-added",
      payload: {},
      sender: "test",
    });
    const [jobId] = enqueued;
    if (!jobId) throw new Error("No job was enqueued");
    return jobId;
  }

  it("is published when the job is detached from the event's operation", async () => {
    const jobId = await enqueueOnEvent(true);

    await monitor.emitJobCompletion(jobId);

    expect(completed).toEqual([jobId]);
  });

  it("is withheld otherwise, as a step of the event's operation", async () => {
    const jobId = await enqueueOnEvent(false);

    await monitor.emitJobCompletion(jobId);

    expect(completed).toEqual([]);
  });
});
