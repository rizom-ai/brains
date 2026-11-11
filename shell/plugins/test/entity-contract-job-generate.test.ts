import { describe, expect, it } from "bun:test";
import { defineJobContract } from "@brains/contracts";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  contractJob,
  createTemplate,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A contract job generates through a template its type declares, as the
 * entity plugin classes' job handlers generated through their own: the
 * template named locally, under the type's plugin.
 */

const summarizeContract = defineJobContract({
  type: "pages:summarize",
  input: z.object({ text: z.string() }),
});

const summary = z.object({ summary: z.string() });

const page = defineEntity({
  type: "page",
  purpose: "A page summarized by a job.",
  metadata: z.object({ title: z.string() }),
  templates: {
    summary: createTemplate({
      name: "summary",
      description: "Summarizes a page",
      schema: summary,
      basePrompt: "Summarize.",
      dataSourceId: "shell:ai-content",
      requiredPermission: "public",
    }),
  },
  jobs: {
    summarize: contractJob(summarizeContract, {
      handle: async (context) =>
        entityRuntime(context).generate(
          {
            template: "summary",
            prompt: context.input.text,
            data: { length: "short" },
            representedIdentity: "none",
          },
          summary,
        ),
    }),
  },
});

describe("a contract job's generation", () => {
  it("generates through its type's template", async () => {
    const shell = createMockShell();
    const asked: unknown[] = [];
    shell.generateContent = async (config): Promise<unknown> => {
      asked.push({
        templateName: config.templateName,
        prompt: config.prompt,
        data: config.data,
        representedIdentity: config.representedIdentity,
      });
      return { summary: "Short." };
    };
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "pages", entities: [page] }),
      {},
      { name: "@fixture/pages", version: "0.1.0" },
      { pluginId: "pages" },
    )) {
      await plugin.register(shell);
    }
    const handler = shell.getJobQueueService().getHandler("pages:summarize");
    if (!handler) throw new Error("No summarize job");
    expect(
      await handler.process(
        handler.validateAndParse({ text: "A long page." }),
        "job-1",
        createMockProgressReporter(),
        new AbortController().signal,
      ),
    ).toEqual({ summary: "Short." });
    expect(asked).toEqual([
      {
        templateName: "pages:summary",
        prompt: "A long page.",
        data: { length: "short" },
        representedIdentity: "none",
      },
    ]);
  });
});
