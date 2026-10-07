import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const replayJob = defineJob({
  name: "replay",
  input: z.object({ from: z.string() }),
  output: z.object({}),
});

/**
 * Work a service must do once its own declarations are bound — its jobs
 * among them — and before the brain announces that every plugin has
 * registered. Setup runs before the runtime has read the `jobs` slot, so a
 * setup that enqueues finds its own job unregistered; the hook runs after.
 * Named consumer: @brains/directory-sync, which reconciles inherited git
 * work by queueing a batch as it comes up.
 */
describe("what a service does once it is registered", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("lifecycle-registered-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  function instantiate(log: string[]): Plugin {
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "directory-sync",
          config: z.object({}),
          setup: ({ lifecycle, jobs }) => {
            lifecycle.onRegistered(async () => {
              log.push("registered");
              await jobs.enqueue(replayJob, { from: "checkpoint" });
            });
            log.push("setup");
            return {};
          },
        },
        {
          jobs: () => [replayJob.handle(async () => ({}))],
        },
      ),
      {},
      { name: "@fixture/directory-sync", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    return plugin;
  }

  it("runs the hook after the jobs are bound, not during setup", async () => {
    const log: string[] = [];
    const plugin = instantiate(log);

    await harness.installPlugin(plugin);
    expect(log).toEqual(["setup"]);

    await harness.finalizeRegistration();

    expect(log).toEqual(["setup", "registered"]);
    const queued = await harness.getMockShell().jobs.getRecentJobs();
    expect(queued.map((job) => job.type)).toEqual([`${plugin.id}:replay`]);
  });
});
