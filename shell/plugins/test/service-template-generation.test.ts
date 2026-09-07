import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger, stubMethod } from "@brains/test-utils";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type { JobHandler } from "@brains/job-queue";
import {
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type ServiceTemplateReads,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const fillSection = defineJob({
  name: "fill-section",
  input: z.object({ template: z.string() }),
  output: z.object({ markdown: z.string(), canGenerate: z.boolean() }),
});

/**
 * A page section is filled in from a template the brain composed, not from
 * one the filling package wrote: the route names the template, the registry
 * holds its schema and its prompt, and the package that owns the section
 * entity only says which section to fill and stores the answer.
 * Named consumer: @brains/site-content.
 */
describe("generating against a template the runtime holds", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("template-generation-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<{
    reads: ServiceTemplateReads;
    run: (template: string) => Promise<unknown>;
  }> {
    const handlers = new Map<string, JobHandler>();
    const queue = harness.getMockShell().getJobQueueService();
    stubMethod(queue, "registerHandler", (name, handler) => {
      handlers.set(name, handler);
    });
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;

    let captured: ServiceTemplateReads | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "site-content",
          config: z.object({}),
          setup: ({ templates }) => {
            captured = templates;
            return {};
          },
        },
        {
          jobs: () => [
            fillSection.handle(async ({ input, templates }) => {
              const capabilities = templates.capabilities(input.template);
              if (!capabilities?.canGenerate) {
                return { markdown: "", canGenerate: false };
              }
              const value = await templates.generate(input.template, {
                data: { headline: "from the model" },
              });
              return {
                markdown: templates.format(input.template, value),
                canGenerate: true,
              };
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/site-content", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");

    const handler = handlers.get(
      "@fixture/site-content:site-content:fill-section",
    );
    if (!handler) throw new Error("The fill-section job was not registered");

    return {
      reads: captured,
      run: (template) =>
        handler.process(
          { template },
          "job-1",
          createMockProgressReporter(),
          new AbortController().signal,
        ),
    };
  }

  it("reports that a template with no prompt cannot generate", async () => {
    const { reads } = await install();

    expect(reads.capabilities("nobody:nothing")).toBeNull();
  });

  it("reports what a registered template can do", async () => {
    const { reads } = await install();
    registerSection("hero", { basePrompt: "Write a headline" });

    expect(reads.capabilities("landing-page:hero")?.canGenerate).toBe(true);
  });

  it("refuses to fill a section whose template cannot generate", async () => {
    const { run } = await install();
    registerSection("static", {});

    expect(await run("landing-page:static")).toMatchObject({
      canGenerate: false,
    });
  });

  /** A page section registered the way a composed brain registers one. */
  function registerSection(
    name: string,
    generation: { basePrompt?: string },
  ): void {
    harness.getMockShell().registerTemplates(
      {
        [name]: {
          name,
          description: `The ${name} section`,
          schema: z.object({ headline: z.string() }),
          requiredPermission: "public",
          ...(generation.basePrompt
            ? {
                basePrompt: generation.basePrompt,
                dataSourceId: "shell:ai-content",
              }
            : {}),
        },
      },
      "landing-page",
    );
  }
});
