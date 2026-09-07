import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
  type ServiceJobs,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const importJob = defineJob({
  name: "directory-import",
  input: z.object({ file: z.string() }),
  output: z.object({}),
});
const cleanupJob = defineJob({
  name: "directory-cleanup",
  input: z.object({}),
  output: z.object({}),
});
/** Declared by nobody installed here. */
const strayJob = defineJob({
  name: "stray",
  input: z.object({}),
  output: z.object({}),
});

/**
 * Several jobs enqueued as one batch, so a sweep of the filesystem reports
 * as one piece of work rather than as forty. The runtime files the children
 * under the package's own job names and its own id, and links them to the
 * root the caller names when coordination began elsewhere.
 * Named consumer: @brains/directory-sync.
 */
describe("batches a declared service enqueues", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("job-batches-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<{ plugin: Plugin; jobs: ServiceJobs }> {
    let captured: ServiceJobs | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "directory-sync",
        config: z.object({}),
        setup: ({ jobs }) => {
          captured = jobs;
          return {};
        },
        jobs: () => [
          importJob.handle(async () => ({})),
          cleanupJob.handle(async () => ({})),
        ],
      }),
      {},
      { name: "@fixture/directory-sync", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return { plugin, jobs: captured };
  }

  it("files the operations as one batch under the package's own names", async () => {
    const { plugin, jobs } = await install();

    const batch = await jobs.enqueueBatch(
      [
        { definition: importJob, input: { file: "notes/a.md" } },
        { definition: importJob, input: { file: "notes/b.md" } },
        { definition: cleanupJob, input: {} },
      ],
      { operationTarget: "/srv/brain", rootJobId: "sweep-1" },
    );

    expect(batch.id).toBe("sweep-1");
    const queued = await harness.getMockShell().jobs.getRecentJobs();
    expect(
      queued.map((job) => [job.type, job.source, job.metadata["rootJobId"]]),
    ).toEqual([
      [`${plugin.id}:directory-import`, plugin.id, "sweep-1"],
      [`${plugin.id}:directory-import`, plugin.id, "sweep-1"],
      [`${plugin.id}:directory-cleanup`, plugin.id, "sweep-1"],
    ]);
    expect(queued[0]?.metadata).toMatchObject({
      operationTarget: "/srv/brain",
      operationType: "batch_processing",
    });
  });

  it("reports the batch as one piece of work", async () => {
    const { jobs } = await install();

    const batch = await jobs.enqueueBatch([
      { definition: importJob, input: { file: "notes/a.md" } },
      { definition: cleanupJob, input: {} },
    ]);

    expect(await batch.status()).toEqual({
      id: batch.id,
      status: "pending",
      total: 2,
      completed: 0,
      failed: 0,
      errors: [],
    });
    expect(await jobs.batchStatus(batch.id)).toEqual(await batch.status());
  });

  it("refuses a job the package did not declare", async () => {
    const { jobs } = await install();

    expect(
      jobs.enqueueBatch([{ definition: strayJob, input: {} }]),
    ).rejects.toThrow(/cannot enqueue unregistered job "stray"/);
    expect(await harness.getMockShell().jobs.getRecentJobs()).toEqual([]);
  });
});
