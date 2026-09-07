import { afterEach, describe, expect, it } from "bun:test";
import {
  createMockProgressReporter,
  createSilentLogger,
  stubMethod,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type { JobHandler } from "@brains/job-queue";
import {
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type ServiceJobSettledContext,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const importJob = defineJob({
  name: "directory-import",
  input: z.object({ path: z.string() }),
  output: z.object({}),
});
const plainJob = defineJob({
  name: "plain",
  input: z.object({}),
  output: z.object({}),
});

/**
 * A job is settled once the queue has durably recorded where it ended —
 * after retries, which is why this is not part of the run: a throwing run
 * may run again, and a child of a bulk mutation is accounted for exactly
 * once, when the queue has given up or succeeded.
 * Named consumer: @brains/directory-sync.
 */
describe("what a declared job is told once the queue has settled it", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("job-settled-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<{
    handlers: Map<string, JobHandler>;
    settled: ServiceJobSettledContext<{ path: string }>[];
  }> {
    const handlers = new Map<string, JobHandler>();
    const queue = harness.getMockShell().getJobQueueService();
    stubMethod(queue, "registerHandler", (name, handler) => {
      handlers.set(name, handler);
    });
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;
    const settled: ServiceJobSettledContext<{ path: string }>[] = [];

    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "directory-sync",
          config: z.object({}),
        },
        {
          jobs: () => [
            importJob.handle(async () => ({}), {
              settled: async (context) => {
                settled.push(context);
              },
            }),
            plainJob.handle(async () => ({})),
          ],
        },
      ),
      {},
      { name: "@fixture/directory-sync", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    return { handlers, settled };
  }

  it("hears that it completed, with the input it ran with", async () => {
    const { handlers, settled } = await install();
    const handler = handlers.get(
      "@fixture/directory-sync:directory-sync:directory-import",
    );
    if (!handler) throw new Error("The import job was not registered");

    await handler.onTerminalSuccess?.(
      { path: "notes/a.md" },
      "job-1",
      createMockProgressReporter(),
      new AbortController().signal,
    );

    expect(settled).toEqual([
      { input: { path: "notes/a.md" }, jobId: "job-1", outcome: "completed" },
    ]);
  });

  it("hears that it failed for good, with the failure", async () => {
    const { handlers, settled } = await install();
    const handler = handlers.get(
      "@fixture/directory-sync:directory-sync:directory-import",
    );
    if (!handler) throw new Error("The import job was not registered");
    const failure = new Error("The file vanished");

    await handler.onTerminalError?.(
      failure,
      { path: "notes/a.md" },
      "job-2",
      createMockProgressReporter(),
      new AbortController().signal,
    );

    expect(settled).toEqual([
      {
        input: { path: "notes/a.md" },
        jobId: "job-2",
        outcome: "failed",
        error: failure,
      },
    ]);
  });

  it("is not asked when it declared no interest", async () => {
    const { handlers } = await install();
    const handler = handlers.get(
      "@fixture/directory-sync:directory-sync:plain",
    );
    if (!handler) throw new Error("The plain job was not registered");

    expect(handler.onTerminalSuccess).toBeUndefined();
    expect(handler.onTerminalError).toBeUndefined();
  });
});
