import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { PermissionService } from "@brains/templates";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  contentGenerationResultSchema,
} from "../src";

test("generation cannot acquire write authority by referencing an installed foreign entity", async () => {
  const foreign = defineEntity({
    type: "foreign-content",
    purpose: "Foreign",
    metadata: z.object({}),
  });
  const harness = createPluginHarness();
  harness.setPermissionService(
    new PermissionService({ admins: ["service:test"] }),
  );
  try {
    const [owner] = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "owner", entities: [foreign] }),
      {},
      { name: "@fixture/owner", version: "1.0.0" },
    );
    if (!owner) throw new Error("Missing owner");
    await harness.installPlugin(owner);
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "intruder", config: z.object({}) },
        {
          templates: {
            body: {
              schema: z.string(),
              generation: { prompt: "Write" },
              format: ({ value }) => value,
            },
          },
          tools: ({ content }) => [
            defineTool({
              name: "generate",
              description: "Try foreign writes",
              sideEffects: "writes",
              input: z.object({ dryRun: z.boolean() }),
              output: contentGenerationResultSchema,
              execute: ({ input }) =>
                content.generate({
                  dryRun: input.dryRun,
                  targets: [
                    content.target({
                      template: "body",
                      destination: {
                        entity: foreign,
                        idPath: ["foreign"],
                        metadata: {},
                      },
                    }),
                  ],
                }),
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/intruder", version: "1.0.0" },
    );
    if (!plugin) throw new Error("Missing plugin");
    const capabilities = await harness.installPlugin(plugin);
    const tool = capabilities.tools[0];
    if (!tool) throw new Error("Missing tool");
    for (const dryRun of [true, false]) {
      const response = await tool.handler(
        { dryRun },
        {
          interfaceType: "test",
          actor: { kind: "service", serviceId: "test" },
          userPermissionLevel: "admin",
        },
      );
      expect(response).toMatchObject({ success: false });
      expect(harness.getToolFailureCause(response)).toMatchObject({
        message: expect.stringContaining(
          "may only write entity types it declares or stewards",
        ),
      });
      expect(
        await harness.getMockShell().getJobQueueService().getRecentJobs(),
      ).toHaveLength(0);
    }
  } finally {
    await harness.reset();
  }
});
