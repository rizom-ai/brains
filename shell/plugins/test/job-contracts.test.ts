import { describe, expect, it } from "bun:test";
import { defineJobContract, type JobContract } from "@brains/contracts";
import type { JobHandler } from "@brains/job-queue";
import { z } from "@brains/utils/zod";
import { createServicePluginContext } from "../src/service/context";
import { createMockShell } from "../src/test/mock-shell";

const renderInputSchema = z.strictObject({
  prompt: z.string().min(1),
  size: z.number().default(1),
});

const render: JobContract<typeof renderInputSchema> = defineJobContract({
  type: "owner:render",
  input: renderInputSchema,
});

const renderHandler: JobHandler = {
  validateAndParse: (data) => renderInputSchema.parse(data),
  process: async () => ({ success: true }),
};

describe("job contracts", () => {
  it("enqueues the contract's job type with the parsed input", async () => {
    const shell = createMockShell();
    const caller = createServicePluginContext(shell, "caller");

    const jobId = await caller.jobs.enqueue(render, { prompt: "a lighthouse" });

    const job = await shell.getJobQueueService().getStatus(jobId);
    expect(job?.type).toBe("owner:render");
    expect(JSON.parse(job?.data ?? "null")).toEqual({
      prompt: "a lighthouse",
      size: 1,
    });
  });

  it("routes and attributes the job as a raw enqueue does", async () => {
    const shell = createMockShell();
    const caller = createServicePluginContext(shell, "caller");

    const jobId = await caller.jobs.enqueue(
      render,
      { prompt: "a lighthouse" },
      {
        toolContext: {
          interfaceType: "job",
          actor: { kind: "service", serviceId: "caller-generation" },
        },
        options: {
          source: "spoofed",
          metadata: { operationType: "content_operations" },
        },
      },
    );

    const job = await shell.getJobQueueService().getStatus(jobId);
    expect(job?.source).toBe("caller");
    expect(job?.metadata).toMatchObject({
      operationType: "content_operations",
      pluginId: "caller",
      interfaceType: "job",
      requestedByActor: { kind: "service", serviceId: "caller-generation" },
    });
  });

  it("refuses invalid input before anything is queued", async () => {
    const shell = createMockShell();
    const caller = createServicePluginContext(shell, "caller");

    const refusal = await caller.jobs.enqueue(render, { prompt: "" }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(Error);
    expect(String(refusal)).toContain("Invalid job data for owner:render");
    expect(await shell.getJobQueueService().getActiveJobs()).toEqual([]);
  });

  it("knows whether the job's owner is installed", () => {
    const shell = createMockShell();
    const caller = createServicePluginContext(shell, "caller");

    expect(caller.jobs.has(render)).toBe(false);

    createServicePluginContext(shell, "owner").jobs.registerHandler(
      "render",
      renderHandler,
    );

    expect(caller.jobs.has(render)).toBe(true);
  });

  it("keeps enqueueing a plugin's own job types by name", async () => {
    const shell = createMockShell();
    const owner = createServicePluginContext(shell, "owner");

    const jobId = await owner.jobs.enqueue({
      type: "render",
      data: { prompt: "a lighthouse" },
    });

    expect((await shell.getJobQueueService().getStatus(jobId))?.type).toBe(
      "owner:render",
    );
  });
});
