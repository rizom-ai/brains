import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { stubMethod } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type { JobHandler } from "@brains/job-queue";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  resetPromptCache,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const classifyJob = defineJob({
  name: "classify",
  input: z.object({ text: z.string() }),
  output: z.object({ rubric: z.string() }),
});

/**
 * An operator-editable rubric lives in a prompt entity the runtime owns. A
 * job that classifies against it asks the runtime for the current text and
 * falls back to the package's default when nobody has edited it. Named
 * consumer: @brains/email-workflows.
 */
describe("job context prompts", () => {
  async function runClassify(seedPrompt: string | undefined): Promise<unknown> {
    resetPromptCache();
    const harness = createPluginHarness({
      logger: createSilentLogger("job-prompts-test"),
    });
    if (seedPrompt !== undefined) {
      await harness.getEntityService().createEntity({
        entity: {
          id: "triage-rubric",
          entityType: "prompt",
          content: `---\ntitle: Triage Rubric\ntarget: triage:rubric\n---\n${seedPrompt}`,
          metadata: { title: "Triage Rubric", target: "triage:rubric" },
        },
      });
    }
    const handlers = new Map<string, JobHandler>();
    const queue = harness.getMockShell().getJobQueueService();
    stubMethod(queue, "registerHandler", (name, handler) => {
      handlers.set(name, handler);
    });
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;

    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "triage",
          config: z.object({}),
        },
        {
          jobs: () => [
            classifyJob.handle(async ({ prompts }) => ({
              rubric: await prompts.resolve("triage:rubric", "default rubric"),
            })),
          ],
        },
      ),
      {},
      { name: "@fixture/triage", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    const handler = handlers.get("@fixture/triage:triage:classify");
    if (!handler) throw new Error("Classify job handler was not registered");
    const result = await handler.process(
      { text: "hello" },
      "job-1",
      createMockProgressReporter(),
      new AbortController().signal,
    );
    await harness.reset();
    return result;
  }

  it("resolves the edited prompt when one exists", async () => {
    expect(await runClassify("Prioritise collaboration.")).toEqual({
      rubric: "Prioritise collaboration.",
    });
  });

  it("falls back to the package default when nobody has edited it", async () => {
    expect(await runClassify(undefined)).toEqual({ rubric: "default rubric" });
  });
});
