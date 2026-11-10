import { afterEach, expect, test } from "bun:test";
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
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";

/**
 * Grouping fields on a declared type, whose reads hand back its body alone:
 * the frontmatter a grouping keeps lives only in the stored document, so a
 * field update confirms the stored value and keeps every other field the
 * document carries, as it does for an entity plugin class's type.
 */

const memo = defineEntity({
  type: "memo",
  purpose: "A memo in a grouping.",
  metadata: z.object({ title: z.string() }),
});

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function fixture(): Promise<{
  stored: () => Promise<string>;
  exec: (
    input: Record<string, unknown>,
  ) => ReturnType<ReturnType<typeof createEntityUpdateTool>["handler"]>;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities: [memo] }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
  )) {
    if (plugin instanceof EntityPlugin) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
      );
    }
  }
  for (const field of ["clients", "projects"]) {
    registry.registerGrouping({
      key: field,
      field,
      label: field,
      types: ["memo"],
    });
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
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected embedding");
      },
      generateEmbeddings: async () => {
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
    input: {
      entityType: "memo",
      id: "member",
      markdown:
        "---\ntitle: Member\nclients: [Acme]\nprojects: [Launch]\nunclaimed: null\n---\nBody\n",
    },
  });
  const tool = createEntityUpdateTool(
    createMockSystemServices({
      entityRegistry: registry,
      entityService: service,
    }),
  );
  return {
    stored: async () =>
      (
        await service.getEntity({
          entityType: "memo",
          id: "member",
          visibilityScope: "restricted",
          source: true,
        })
      )?.content ?? "",
    exec: (input) =>
      tool.handler(input, {
        interfaceType: "test",
        actor: { kind: "user", userId: "editor" },
        userPermissionLevel: "admin",
      }),
  };
}

const confirmation = z.object({
  needsConfirmation: z.literal(true),
  preview: z.string(),
  args: z.record(z.string(), z.unknown()),
});

test("confirms the stored value and keeps the document's other fields", async () => {
  const { stored, exec } = await fixture();
  const proposal = confirmation.parse(
    await exec({
      entityType: "memo",
      id: "member",
      operation: { fields: { clients: ["Beta"], title: "Renamed" } },
    }),
  );
  expect(proposal.preview).toContain('clients: ["Acme"] → ["Beta"]');
  expect(await exec(proposal.args)).toMatchObject({ success: true });
  expect(await stored()).toBe(
    "---\ntitle: Renamed\nclients:\n  - Beta\nprojects:\n  - Launch\nunclaimed: null\n---\nBody\n",
  );
});

test("removes a field and keeps the others", async () => {
  const { stored, exec } = await fixture();
  const proposal = confirmation.parse(
    await exec({
      entityType: "memo",
      id: "member",
      operation: { fields: { clients: null } },
    }),
  );
  expect(proposal.preview).toContain('clients: ["Acme"] → (removed)');
  expect(await exec(proposal.args)).toMatchObject({ success: true });
  expect(await stored()).toBe(
    "---\ntitle: Member\nprojects:\n  - Launch\nunclaimed: null\n---\nBody\n",
  );
});
