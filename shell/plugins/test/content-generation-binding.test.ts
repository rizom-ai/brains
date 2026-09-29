import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import { contentGenerationJobDataSchema } from "@brains/content-service";
import {
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  contentGenerationResultSchema,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

// Admission binding evidence only; durable worker/persistence coverage lives in content-service.
test("mixed checked targets retain template keys and bind the submitting caller, not their constructor", async () => {
  let validations = 0;
  const chapter = defineEntity({
    type: "chapter",
    purpose: "Chapter",
    metadata: z.object({ title: z.string(), bookId: z.string() }),
  });
  const summary = defineEntity({
    type: "summary",
    purpose: "Summary",
    metadata: z.object({
      audience: z.string(),
      edition: z.coerce.number<string>().transform((value) => {
        validations++;
        return value;
      }),
    }),
  });
  const definition = defineServicePlugin({
    id: "mixed-content",
    config: z.object({}),
    templates: {
      chapter: {
        schema: z.string(),
        generation: { prompt: "Write chapter" },
        format: ({ value }) => value,
      },
      summary: {
        schema: z.string(),
        generation: { prompt: "Write summary" },
        format: ({ value }) => value,
      },
    },
    tools: ({ content }) => {
      // Constructed once, before any caller executes a tool.
      const first = content.target({
        template: "chapter",
        destination: {
          entity: chapter,
          idPath: ["intro"],
          metadata: { title: "Intro", bookId: "book" },
        },
      });
      const second = content.target({
        template: "summary",
        destination: {
          entity: summary,
          idPath: ["book", "summary"],
          metadata: { audience: "beginner", edition: "2" },
        },
      });
      return [
        defineTool({
          name: "generate",
          description: "Generate mixed entities",
          input: z.object({ dryRun: z.boolean() }),
          output: contentGenerationResultSchema,
          sideEffects: "writes",
          execute: ({ input }) =>
            content.generate({
              targets: [first, second],
              dryRun: input.dryRun,
            }),
        }),
      ];
    },
  });
  const harness = createPluginHarness({ logger: createSilentLogger() });
  harness.setPermissionService(
    new PermissionService({ admins: ["service:first", "service:second"] }),
  );
  const entityPlugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "mixed-entities", entities: [chapter, summary] }),
    {},
    { name: "@fixture/mixed-entities", version: "0.1.0" },
  );
  for (const plugin of entityPlugins) await harness.installPlugin(plugin);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/mixed-content", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Missing plugin");
  const capabilities = await harness.installPlugin(plugin);
  const [generate] = capabilities.tools;
  if (!generate) throw new Error("Missing tools");
  const queue = harness.getMockShell().getJobQueueService();
  const firstCaller = {
    interfaceType: "test",
    actor: { kind: "service" as const, serviceId: "first" },
    userPermissionLevel: "admin" as const,
  };
  const preview = z
    .object({ data: contentGenerationResultSchema })
    .parse(await generate.handler({ dryRun: true }, firstCaller)).data;
  expect(preview.queuedTargets).toBe(0);
  expect(preview.batchId).toBeUndefined();
  expect(preview.items.map((item) => item.template)).toEqual([
    "chapter",
    "summary",
  ]);
  expect(await queue.getRecentJobs()).toEqual([]);
  for (const serviceId of ["first", "second"]) {
    const caller = {
      ...firstCaller,
      actor: { kind: "service" as const, serviceId },
    };
    const result = z
      .object({ data: contentGenerationResultSchema })
      .parse(await generate.handler({ dryRun: false }, caller)).data;
    expect(result.items.map((item) => item.template)).toEqual([
      "chapter",
      "summary",
    ]);
    expect(result.items.map((item) => item.destination.entityType)).toEqual([
      "chapter",
      "summary",
    ]);
    expect(result.queuedTargets).toBe(2);
    for (const item of result.items) {
      if (item.status !== "queued") throw new Error("Expected queued target");
      const job = await queue.getStatus(item.jobId);
      const data = contentGenerationJobDataSchema.parse(
        JSON.parse(job?.data ?? "null"),
      );
      expect(data.authority.actor).toEqual(caller.actor);
      if (item.template === "summary")
        expect(data.destination.metadata).toEqual({
          audience: "beginner",
          edition: 2,
        });
    }
    if (!result.batchId) throw new Error("Missing batch");
    // Children stay recoverable through the queue's durable root index.
    expect(await queue.getJobsByRootJobId(result.batchId)).toHaveLength(2);
  }
  expect(validations).toBe(1);
});
