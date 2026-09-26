import { describe, expect, it } from "bun:test";
import { createMockJobQueue } from "../src/test/mock-job-queue";

describe("createMockJobQueue", () => {
  it("remembers an enqueued job so status reads find it", async () => {
    // A fake queue that forgets its own enqueues makes reconciliation code
    // treat every fresh job as pruned.
    const { jobQueueService } = createMockJobQueue();
    const id = await jobQueueService.enqueue({ type: "sync", data: {} });

    expect(await jobQueueService.getStatus(id)).toMatchObject({
      id,
      type: "sync",
      status: "pending",
    });
  });

  it("serializes every job payload, including strings, as JSON", async () => {
    const { jobQueueService } = createMockJobQueue();
    const structured = await jobQueueService.enqueue({
      type: "sync",
      data: { a: 1 },
    });
    const raw = await jobQueueService.enqueue({
      type: "sync",
      data: "already text",
    });

    expect((await jobQueueService.getStatus(structured))?.data).toBe('{"a":1}');
    expect((await jobQueueService.getStatus(raw))?.data).toBe(
      JSON.stringify("already text"),
    );
  });

  it("roots a job at itself when no root is given", async () => {
    const { jobQueueService } = createMockJobQueue();
    const id = await jobQueueService.enqueue({ type: "sync", data: {} });

    expect((await jobQueueService.getStatus(id))?.metadata.rootJobId).toBe(id);
    expect(await jobQueueService.getJobsByRootJobId(id)).toHaveLength(1);
  });

  it("roots every job of a batch at the batch id", async () => {
    const { jobs, jobQueueService } = createMockJobQueue();
    const batchId = await jobs.enqueueBatch(
      [
        { type: "sync", data: {} },
        { type: "sync", data: {} },
      ],
      { source: "test", metadata: { operationType: "data_processing" } },
      "batch-1",
      "test",
    );

    expect(batchId).toBe("batch-1");
    expect(await jobQueueService.getJobsByRootJobId("batch-1")).toHaveLength(2);
  });

  it("shows the same jobs through both views", async () => {
    // The namespace and the service are two views of one queue; separate
    // state would let a test enqueue through one and read nothing from
    // the other.
    const { jobs, jobQueueService } = createMockJobQueue();
    await jobQueueService.enqueue({ type: "sync", data: {} });

    expect(await jobs.getActiveJobs()).toHaveLength(1);
  });

  it("filters active jobs by type when asked", async () => {
    const { jobQueueService } = createMockJobQueue();
    await jobQueueService.enqueue({ type: "sync", data: {} });
    await jobQueueService.enqueue({ type: "index", data: {} });

    expect(await jobQueueService.getActiveJobs(["sync"])).toHaveLength(1);
    // An empty list is not a filter that matches nothing.
    expect(await jobQueueService.getActiveJobs([])).toHaveLength(2);
    expect(await jobQueueService.getActiveJobs()).toHaveLength(2);
  });

  it("returns recent jobs newest first and honours the limit", async () => {
    const { jobQueueService } = createMockJobQueue();
    await jobQueueService.enqueue({ type: "sync", data: { n: 1 } });
    await jobQueueService.enqueue({ type: "sync", data: { n: 2 } });
    await jobQueueService.enqueue({ type: "sync", data: { n: 3 } });

    const recent = await jobQueueService.getRecentJobs(undefined, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.createdAt).toBeGreaterThanOrEqual(
      recent[1]?.createdAt ?? 0,
    );
  });

  it("never dequeues, and says so consistently", async () => {
    // No worker loop is modelled. A fake that handed back a job here would
    // make a test believe it held a claim nothing can renew.
    const { jobQueueService } = createMockJobQueue();
    await jobQueueService.enqueue({ type: "sync", data: {} });

    expect(await jobQueueService.dequeue()).toBeNull();
    expect(await jobQueueService.getActiveJobs()).toHaveLength(1);
  });
});
