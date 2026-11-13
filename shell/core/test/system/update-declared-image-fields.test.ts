import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { setOgImageId } from "@brains/image";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";

// Declared types keep their metadata as their frontmatter. main writes
// covers and social cards into frontmatter (system_update, the image render
// job), so the record's metadata has to follow that write at once.
const card = defineEntity({
  type: "card",
  purpose: "A card with a cover.",
  metadata: z.object({
    title: z.string(),
    coverImageId: z.string().optional(),
  }),
  coverImage: true,
});
const post = defineEntity({
  type: "post",
  purpose: "A post with a social card.",
  metadata: z.object({ title: z.string(), ogImageId: z.string().optional() }),
});

let service: EntityService | undefined;
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  service?.close();
  await cleanup?.();
});

function register(
  registry: EntityRegistry,
  definitions: readonly AnyEntityDefinition[],
): void {
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "cards", entities: definitions }),
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
}

async function fixture(): Promise<{
  service: EntityService;
  update: (fields: Record<string, unknown>) => Promise<unknown>;
}> {
  const directory = await createTestDirectory();
  cleanup = directory.cleanup;
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  register(registry, [card, post]);
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const created = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: createRefusingEmbeddingService(),
  });
  service = created;
  await created.initialize();
  for (const entityType of ["card", "post"]) {
    await created.createEntity({
      entity: {
        id: "tide",
        entityType,
        content: "Body text",
        metadata: { title: "Tide" },
      },
    });
  }
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
    update: async (fields): Promise<unknown> => {
      const input = {
        entityType: "card",
        id: "tide",
        operation: { fields },
      };
      const proposal = z
        .object({ args: z.record(z.string(), z.unknown()) })
        .parse(await exec(input));
      return exec(proposal.args);
    },
  };
}

async function stored(
  current: EntityService,
  entityType: string,
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

describe("a frontmatter write on a declared type", () => {
  it("moves the cover system_update sets into metadata at once", async () => {
    const { service: current, update } = await fixture();

    expect(await update({ coverImageId: "first" })).toMatchObject({
      success: true,
    });
    const first = await stored(current, "card");
    expect(frontmatter(current, first)["coverImageId"]).toBe("first");
    expect(first.metadata["coverImageId"]).toBe("first");

    // Replacing a cover the metadata already holds must not revert it.
    expect(await update({ coverImageId: "second" })).toMatchObject({
      success: true,
    });
    const second = await stored(current, "card");
    expect(frontmatter(current, second)["coverImageId"]).toBe("second");
    expect(second.metadata["coverImageId"]).toBe("second");
  });

  it("moves the social card the image job records into metadata at once", async () => {
    const { service: current } = await fixture();

    await current.updateEntity({
      entity: setOgImageId(await stored(current, "post"), "og-first"),
    });
    const first = await stored(current, "post");
    expect(frontmatter(current, first)["ogImageId"]).toBe("og-first");
    expect(first.metadata["ogImageId"]).toBe("og-first");

    await current.updateEntity({
      entity: setOgImageId(await stored(current, "post"), "og-second"),
    });
    const second = await stored(current, "post");
    expect(frontmatter(current, second)["ogImageId"]).toBe("og-second");
    expect(second.metadata["ogImageId"]).toBe("og-second");
  });

  it("still lets a metadata write change the frontmatter", async () => {
    const { service: current } = await fixture();
    const entity = await stored(current, "post");

    await current.updateEntity({
      entity: { ...entity, metadata: { ...entity.metadata, title: "Ebb" } },
    });
    const updated = await stored(current, "post");
    expect(updated.metadata["title"]).toBe("Ebb");
    expect(frontmatter(current, updated)["title"]).toBe("Ebb");
  });
});
