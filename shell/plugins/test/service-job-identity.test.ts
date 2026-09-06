import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger, stubMethod } from "@brains/test-utils";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type { JobHandler } from "@brains/job-queue";
import {
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const buildJob = defineJob({
  name: "site-build",
  input: z.object({ environment: z.string() }),
  output: z.object({ recordedAgainst: z.string() }),
});

/**
 * A handler that keeps a projection of its own runs records each outcome
 * against the id the requester is holding. Without the id in hand the two
 * records cannot be joined, and an operator page cannot say which build
 * failed. Named consumer: @brains/site-builder.
 */
describe("the id a handler's work was queued under", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-job-identity-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("reaches the handler that runs the work", async () => {
    const handlers = new Map<string, JobHandler>();
    const queue = harness.getMockShell().getJobQueueService();
    stubMethod(queue, "registerHandler", (name, handler) => {
      handlers.set(name, handler);
    });
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;

    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "site-builder",
        config: z.object({}),
        jobs: () => [
          buildJob.handle(async ({ jobId }) => ({ recordedAgainst: jobId })),
        ],
      }),
      {},
      { name: "@fixture/site-builder", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    const handler = handlers.get(
      "@fixture/site-builder:site-builder:site-build",
    );
    if (!handler) throw new Error("Site build job handler was not registered");

    expect(
      await handler.process(
        { environment: "preview" },
        "job-42",
        createMockProgressReporter(),
        new AbortController().signal,
      ),
    ).toEqual({ recordedAgainst: "job-42" });
  });
});
