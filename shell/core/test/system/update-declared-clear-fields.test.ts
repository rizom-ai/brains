import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
} from "@brains/entity-service";
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

// A declared type's metadata is its frontmatter, and reads hand back the
// body alone, so clearing a field has to reach the metadata itself.
const card = defineEntity({
  type: "card",
  purpose: "A card with a cover and an optional subtitle.",
  metadata: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    tone: z.string().default("plain"),
    coverImageId: z.string().optional(),
  }),
  coverImage: true,
});
// A cover the schema defaults cannot be cleared: the type keeps a value.
const poster = defineEntity({
  type: "poster",
  purpose: "A poster that always shows a cover.",
  metadata: z.object({
    title: z.string(),
    coverImageId: z.string().default("placeholder"),
  }),
  coverImage: true,
});

let service: EntityService | undefined;
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  service?.close();
  await cleanup?.();
});

async function fixture(): Promise<{
  service: EntityService;
  update: (
    fields: Record<string, unknown>,
    entityType?: string,
  ) => Promise<unknown>;
}> {
  const directory = await createTestDirectory();
  cleanup = directory.cleanup;
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "cards", entities: [card, poster] }),
    {},
    { name: "@fixture/cards", version: "0.1.0" },
  )) {
    if (!(plugin instanceof EntityPlugin)) {
      throw new Error("A declared entity did not build an entity plugin");
    }
    registry.registerEntityType(
      plugin.entityType,
      plugin.schema,
      plugin.adapter,
    );
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const created = EntityService.createFresh({
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
  service = created;
  await created.initialize();
  await created.createEntity({
    entity: {
      id: "tide",
      entityType: "poster",
      content: "Body text",
      metadata: { title: "Tide", coverImageId: "cover-1" },
    },
  });
  await created.createEntity({
    entity: {
      id: "tide",
      entityType: "card",
      content: "Body text",
      metadata: {
        title: "Tide",
        subtitle: "Low water",
        tone: "warm",
        coverImageId: "cover-1",
      },
    },
  });
  const tool = createEntityUpdateTool(
    createMockSystemServices({
      entityRegistry: registry,
      entityService: created,
    }),
  );
  const exec = (input: Record<string, unknown>): Promise<unknown> =>
    tool.handler(input, {
      interfaceType: "test",
      actor: { kind: "user", userId: "editor" },
      userPermissionLevel: "admin",
    });
  return {
    service: created,
    update: async (fields, entityType = "card"): Promise<unknown> => {
      const input = {
        entityType,
        id: "tide",
        operation: { kind: "fields", fields },
      };
      const proposed = await exec(input);
      // A refused proposal is the answer: nothing was confirmed or written.
      const proposal = z
        .object({ args: z.record(z.string(), z.unknown()) })
        .safeParse(proposed);
      return proposal.success ? exec(proposal.data.args) : proposed;
    },
  };
}

async function stored(
  current: EntityService,
  entityType = "card",
): Promise<BaseEntity> {
  const entity = await current.getEntity({ entityType, id: "tide" });
  if (!entity) throw new Error(`The ${entityType} is gone`);
  return entity;
}

/** The frontmatter of the file the brain writes for the record. */
function frontmatter(
  current: EntityService,
  entity: BaseEntity,
): Record<string, unknown> {
  return parseMarkdownWithFrontmatter(
    current.serializeEntity(entity),
    z.record(z.string(), z.unknown()),
  ).metadata;
}

describe("clearing a field on a declared type", () => {
  it("removes the cover from metadata and the file", async () => {
    const { service: current, update } = await fixture();

    expect(await update({ coverImageId: null })).toMatchObject({
      success: true,
    });
    const cleared = await stored(current);
    expect(cleared.metadata).not.toHaveProperty("coverImageId");
    expect(frontmatter(current, cleared)).not.toHaveProperty("coverImageId");
    expect(cleared.metadata).toMatchObject({ title: "Tide", tone: "warm" });
  });

  it("removes a plain optional field from metadata and the file", async () => {
    const { service: current, update } = await fixture();

    expect(await update({ subtitle: null })).toMatchObject({ success: true });
    const cleared = await stored(current);
    expect(cleared.metadata).not.toHaveProperty("subtitle");
    expect(frontmatter(current, cleared)).not.toHaveProperty("subtitle");
  });

  it("does not report a clear that did not take as done", async () => {
    const { service: current, update } = await fixture();

    // The schema gives tone a default, so it cannot be left without one.
    const outcome = await update({ tone: null });
    expect(outcome).toMatchObject({ success: false });
    expect(JSON.stringify(outcome)).toContain("tone");
    // Refused before anything is written.
    expect((await stored(current)).metadata["tone"]).toBe("warm");

    const cover = await update({ coverImageId: null }, "poster");
    expect(cover).toMatchObject({ success: false });
    expect(JSON.stringify(cover)).toContain("coverImageId");
    expect((await stored(current, "poster")).metadata["coverImageId"]).toBe(
      "cover-1",
    );
  });
});
