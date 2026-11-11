import { describe, expect, it } from "bun:test";
import { defineJobContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class queues a job as its class
 * queued it through context.jobs: the type scoped to the plugin unless the
 * request names a scope, sourced to the plugin, attributed to the call the
 * request names and to nobody when it names none; and reads a job's status
 * and the recent jobs of its types, as its build status read them.
 */

async function runtimeOn(shell: MockShell): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({ id: "probe", config: z.object({}) }),
      (context) => {
        runtime = serviceRuntime(context);
        return [];
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin was created");
  await plugin.register(shell);
  if (!runtime) throw new Error("The tools slot did not run");
  return runtime;
}

describe("a first-party service queueing a job as its class did", () => {
  it("scopes and sources the job to the plugin, attributed to nobody", async () => {
    const shell = createMockShell();
    const runtime = await runtimeOn(shell);

    const jobId = await runtime.jobs.enqueue({
      type: "select-photo",
      data: { photoId: "abc" },
    });
    const job = await shell.getJobQueueService().getStatus(jobId);
    expect({
      type: job?.type,
      source: job?.source,
      data: JSON.parse(job?.data ?? "null"),
      metadata: job?.metadata,
    }).toEqual({
      type: "probe:select-photo",
      source: "probe",
      data: { photoId: "abc" },
      metadata: {
        operationType: "data_processing",
        pluginId: "probe",
        rootJobId: jobId,
      },
    });
  });

  it("attributes the job to the call the request names, and keeps a scoped type", async () => {
    const shell = createMockShell();
    const runtime = await runtimeOn(shell);

    const jobId = await runtime.jobs.enqueue({
      type: "site-builder:site-build",
      data: {},
      toolContext: {
        interfaceType: "cli",
        actor: { kind: "user", userId: "operator" },
        conversationId: "conversation-1",
      },
    });
    const job = await shell.getJobQueueService().getStatus(jobId);
    expect(job?.type).toBe("site-builder:site-build");
    expect(job?.metadata).toMatchObject({
      pluginId: "probe",
      interfaceType: "cli",
      conversationId: "conversation-1",
      requestedByActor: { kind: "user", userId: "operator" },
      requestedByUserId: "operator",
      requestedByInterface: "cli",
    });
  });

  it("queues another package's job through its contract, as its class did", async () => {
    const shell = createMockShell();
    const runtime = await runtimeOn(shell);
    const render = defineJobContract({
      type: "image:render-source",
      input: z.object({ sourceEntityId: z.string().min(1) }),
    });

    const jobId = await runtime.jobs.enqueue(
      render,
      { sourceEntityId: "post-1" },
      {
        options: {
          source: "probe",
          metadata: { operationType: "content_operations" },
          deduplication: "skip",
          deduplicationKey: "post-1:cover",
        },
      },
    );

    const job = await shell.getJobQueueService().getStatus(jobId);
    // The contract's full type, never rescoped to the plugin.
    expect({
      type: job?.type,
      data: JSON.parse(job?.data ?? "null"),
    }).toEqual({
      type: "image:render-source",
      data: { sourceEntityId: "post-1" },
    });
    // Data the contract refuses throws before anything is queued.
    expect(
      runtime.jobs.enqueue(render, { sourceEntityId: "" }),
    ).rejects.toThrow();
  });

  it("reads the active jobs of the types it names, as its class did", async () => {
    const shell = createMockShell();
    const runtime = await runtimeOn(shell);
    const active = await runtime.jobs.enqueue({ type: "publish", data: {} });
    await runtime.jobs.enqueue({ type: "other", data: {} });

    expect(
      (await runtime.jobs.getActiveJobs(["probe:publish"])).map(({ id }) => id),
    ).toEqual([active]);
    expect(await runtime.jobs.getActiveJobs()).toHaveLength(2);
  });

  it("reads a job's status and the recent jobs of the types it names", async () => {
    const shell = createMockShell();
    const runtime = await runtimeOn(shell);
    const first = await runtime.jobs.enqueue({
      type: "site-build",
      data: { environment: "preview" },
    });
    await runtime.jobs.enqueue({ type: "other", data: {} });

    expect((await runtime.jobs.getStatus(first))?.type).toBe(
      "probe:site-build",
    );
    expect(await runtime.jobs.getStatus("job-unknown")).toBeNull();
    expect(
      (await runtime.jobs.getRecentJobs(["probe:site-build"], 5)).map(
        ({ id }) => id,
      ),
    ).toEqual([first]);
  });
});
