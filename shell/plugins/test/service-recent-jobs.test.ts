import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type ServiceJobs,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * An operator page shows what a package has been doing, not only what it is
 * doing now: the last build that succeeded, the one before it that failed.
 * `active` answers the first question and this answers the second, scoped
 * the same way — this package's own work, nobody else's.
 * Named consumer: @brains/site-builder.
 */
describe("recent work a service queued", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-recent-jobs-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<ServiceJobs> {
    let captured: ServiceJobs | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "site-builder",
        config: z.object({}),
        setup: ({ jobs }) => {
          captured = jobs;
          return {};
        },
      }),
      {},
      { name: "@fixture/site-builder", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  it("reports this package's finished work, newest first", async () => {
    const jobs = await install();
    const queue = harness.getMockShell().getJobQueueService();
    for (const [type, source] of [
      ["site-build", "@fixture/site-builder:site-builder"],
      ["site-build", "@fixture/site-builder:site-builder"],
      ["image:render", "someone-else"],
    ] as const) {
      await queue.enqueue({
        type,
        data: { source },
        options: {
          source,
          metadata: { operationType: "content_operations" },
        },
      });
    }

    const recent = await jobs.recent();

    expect(recent.map((job) => job.type)).toEqual(["site-build", "site-build"]);
    expect(recent.every((job) => job.status === "pending")).toBe(true);
  });

  it("takes a limit, because a page shows a handful", async () => {
    const jobs = await install();
    const queue = harness.getMockShell().getJobQueueService();
    for (let index = 0; index < 4; index += 1) {
      await queue.enqueue({
        type: "site-build",
        data: { index },
        options: {
          source: "@fixture/site-builder:site-builder",
          metadata: { operationType: "content_operations" },
        },
      });
    }

    expect(await jobs.recent({ limit: 2 })).toHaveLength(2);
  });

  /**
   * A projection that survives a restart holds job ids, not definitions: it
   * recorded that a build was running and has to ask what became of it.
   */
  it("answers for one job this package queued, by its id", async () => {
    const jobs = await install();
    const queue = harness.getMockShell().getJobQueueService();
    const jobId = await queue.enqueue({
      type: "site-build",
      data: { environment: "preview" },
      options: {
        source: "@fixture/site-builder:site-builder",
        metadata: { operationType: "content_operations" },
      },
    });

    const found = await jobs.find(jobId);

    expect(found?.id).toBe(jobId);
    expect(found?.type).toBe("site-build");
    expect(found?.data).toEqual({ environment: "preview" });
  });

  it("answers nothing for work another package queued", async () => {
    const jobs = await install();
    const queue = harness.getMockShell().getJobQueueService();
    const jobId = await queue.enqueue({
      type: "site-build",
      data: {},
      options: {
        source: "someone-else",
        metadata: { operationType: "content_operations" },
      },
    });

    expect(await jobs.find(jobId)).toBeNull();
  });
});
