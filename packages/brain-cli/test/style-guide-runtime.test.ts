import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { fetchStyleGuide } from "@brains/contracts";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import styleGuidePackage, {
  createStyleGuideContent,
} from "@brains/style-guide";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";

/**
 * The declared style guide on the brain's own entity store: what it seeds,
 * what it keeps of an imported guide, and how it reads a guide the class
 * wrote, whose fields lived in its content and whose metadata was empty.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

interface Store {
  service: EntityService;
  plant(): Promise<void>;
  stored(): Promise<{ content: string; contentHash: string } | null>;
  rewrite(content: string, metadata: string): Promise<void>;
}

async function store(): Promise<Store> {
  const temporary = await createTestDirectory();
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${temporary.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const plugins = instantiatePluginPackageDefinition(
    styleGuidePackage,
    {},
    { name: "@brains/style-guide", version: "0.0.0-test" },
    { pluginId: "style-guide" },
  );
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of plugins) {
    if (!(plugin instanceof EntityPlugin)) throw new Error("No entity plugin");
    registry.registerEntityType(
      plugin.entityType,
      plugin.schema,
      plugin.adapter,
      { classification: "system", embeddable: false },
    );
  }
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${temporary.dir}/embeddings.db` },
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
  const shell = createMockShell({ logger, entityService: service });
  for (const plugin of plugins) await plugin.register(shell);
  const db = createClient(dbConfig);
  cleanups.push(async () => {
    db.close();
    service.close();
    await temporary.cleanup();
  });
  return {
    service,
    async plant(): Promise<void> {
      await shell.getMessageBus().send({
        type: SYSTEM_CHANNELS.startupContentSettled,
        payload: {},
        sender: "shell",
        broadcast: true,
      });
    },
    async stored(): Promise<{ content: string; contentHash: string } | null> {
      const result = await db.execute(
        "SELECT content, contentHash FROM entities WHERE entityType = 'style-guide'",
      );
      const row = result.rows[0];
      return row
        ? {
            content: String(row["content"]),
            contentHash: String(row["contentHash"]),
          }
        : null;
    },
    async rewrite(content, metadata): Promise<void> {
      await db.execute({
        sql: "UPDATE entities SET content = ?, contentHash = ?, metadata = ? WHERE entityType = 'style-guide'",
        args: [content, computeContentHash(content), metadata],
      });
    },
  };
}

describe("the declared style guide on the entity store", () => {
  test("seeds the default guide the class seeded, byte for byte", async () => {
    const { plant, stored, service } = await store();

    await plant();

    // The class wrote createStyleGuideContent({ name: "Default style guide" }).
    expect((await stored())?.content).toBe(
      generateMarkdown({ name: "Default style guide" }, ""),
    );
    expect(await fetchStyleGuide(service)).toEqual({
      name: "Default style guide",
      guidance: "",
    });
  });

  test("keeps an imported guide's extension fields through a body update", async () => {
    const { service, stored } = await store();
    await service.createEntityFromMarkdown({
      input: {
        entityType: "style-guide",
        id: "style-guide",
        markdown:
          "---\nname: Imported\nvoice:\n  summary: Precise\ncustomExamples:\n  - Keep this extension\n---\n\nLong-form guidance.",
      },
    });
    const read = await service.getEntity({
      entityType: "style-guide",
      id: "style-guide",
    });
    if (!read) throw new Error("Missing style guide");

    await service.updateEntity({
      entity: { ...read, content: "Revised guidance.\n" },
    });

    const after = parseMarkdown((await stored())?.content ?? "");
    expect(after.frontmatter).toEqual({
      name: "Imported",
      voice: { summary: "Precise" },
      customExamples: ["Keep this extension"],
    });
    expect(after.content.trim()).toBe("Revised guidance.");
  });

  test("reads a guide the class wrote once its metadata is reconciled", async () => {
    const { service, plant, stored, rewrite } = await store();
    await plant();
    // As the class stored a house guide: fields in content, empty metadata.
    const classWritten = createStyleGuideContent(
      { name: "House", voice: { summary: "Plain words" } },
      "Write plainly.",
    );
    await rewrite(classWritten, "{}");

    expect(await fetchStyleGuide(service)).toEqual({
      name: "Default style guide",
      guidance: "",
    });
    expect(await service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 1,
    });

    expect(await fetchStyleGuide(service)).toEqual({
      name: "House",
      voice: { summary: "Plain words" },
      guidance: "Write plainly.",
    });
    expect((await stored())?.content).toBe(classWritten);
  });
});
