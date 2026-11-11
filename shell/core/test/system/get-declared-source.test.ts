import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityReadTools } from "../../src/system/entity-read-tools";
import { createMockSystemServices } from "./mock-services";

// A declared type's ordinary reads hand back its body; system_get answers
// with the stored document, as it does for every other type, so the agent
// sees the authored frontmatter the type does not own as well.
const guidance = defineEntity({
  type: "guidance",
  purpose: "Instructions the brain follows",
  metadata: z.object({ title: z.string(), target: z.string() }),
});

const AUTHORED =
  "---\ntitle: Guidance\ntarget: note:test\nclients:\n  - Acme\n---\nKeep these instructions.\n";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function systemGet(input: Record<string, unknown>): Promise<unknown> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "declared", entities: [guidance] }),
    {},
    { name: "@fixture/declared", version: "0.1.0" },
  )) {
    if (!(plugin instanceof EntityPlugin)) throw new Error("No entity plugin");
    registry.registerEntityType(
      plugin.entityType,
      plugin.schema,
      plugin.adapter,
    );
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  await service.createEntityFromMarkdown({
    input: { entityType: "guidance", id: "guidance", markdown: AUTHORED },
  });
  const tool = createEntityReadTools(
    createMockSystemServices({
      entityRegistry: registry,
      entityService: service,
    }),
  ).find(({ name }) => name === "system_get");
  if (!tool) throw new Error("No system_get");
  return tool.handler(input, {
    interfaceType: "test",
    actor: { kind: "user", userId: "editor" },
    userPermissionLevel: "admin",
  });
}

describe("system_get on a declared type", () => {
  it("answers with the stored document, authored frontmatter included", async () => {
    const result = z
      .object({
        success: z.literal(true),
        data: z.object({
          entity: z.object({
            content: z.string(),
            metadata: z.record(z.string(), z.unknown()),
          }),
        }),
      })
      .parse(await systemGet({ entityType: "guidance", id: "guidance" }));

    expect(result.data.entity.content).toContain("clients:");
    expect(result.data.entity.content).toContain("Keep these instructions.");
    expect(result.data.entity.metadata).toMatchObject({
      title: "Guidance",
      target: "note:test",
    });
  });

  it("answers with the body alone when asked for the body", async () => {
    const result = z
      .object({
        data: z.object({ entity: z.object({ content: z.string() }) }),
      })
      .parse(
        await systemGet({
          entityType: "guidance",
          id: "guidance",
          part: "body",
        }),
      );

    expect(result.data.entity.content.trim()).toBe("Keep these instructions.");
  });
});
