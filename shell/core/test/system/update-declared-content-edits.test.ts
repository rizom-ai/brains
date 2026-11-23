import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createMockShell, isDeclaredEntityType } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";

// A declared type's metadata is its frontmatter, and reads hand back the
// body alone. This one, like a refined note, must state its title and a
// summary, so its body read on its own does not decode.
const brief = defineEntity({
  type: "brief",
  purpose: "A worked-out brief that states its title and summary.",
  metadata: z.object({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  }),
});

let service: EntityService | undefined;
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  service?.close();
  await cleanup?.();
});

async function fixture(): Promise<{
  service: EntityService;
  update: (operation: Record<string, unknown>) => Promise<unknown>;
}> {
  const directory = await createTestDirectory();
  cleanup = directory.cleanup;
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "briefs", entities: [brief] }),
    {},
    { name: "@fixture/briefs", version: "0.1.0" },
  )) {
    if (!isDeclaredEntityType(plugin)) {
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
    embeddingService: createRefusingEmbeddingService(),
  });
  service = created;
  await created.initialize();
  await created.createEntity({
    entity: {
      id: "round",
      entityType: "brief",
      content: "# The round\n\nThe current proposal is EUR 500k.\n",
      metadata: { title: "The round", summary: "What the round asks." },
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
    update: async (operation): Promise<unknown> => {
      const proposed = await exec({
        entityType: "brief",
        id: "round",
        operation,
      });
      // A refused proposal is the answer: nothing was confirmed or written.
      const proposal = z
        .object({ args: z.record(z.string(), z.unknown()) })
        .safeParse(proposed);
      return proposal.success ? exec(proposal.data.args) : proposed;
    },
  };
}

async function stored(current: EntityService): Promise<BaseEntity> {
  const entity = await current.getEntity({ entityType: "brief", id: "round" });
  if (!entity) throw new Error("The brief is gone");
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

describe("changing the text of a declared type that states its title and summary", () => {
  it("saves an edit of the body under its stored title and summary", async () => {
    const { service: current, update } = await fixture();

    const outcome = await update({
      edits: [{ oldText: "EUR 500k", newText: "no round yet" }],
    });

    expect(outcome).toMatchObject({ success: true });
    const edited = await stored(current);
    expect(edited.content).toContain("The current proposal is no round yet.");
    expect(edited.metadata).toMatchObject({
      title: "The round",
      summary: "What the round asks.",
    });
    expect(frontmatter(current, edited)).toMatchObject({
      title: "The round",
      summary: "What the round asks.",
    });
  });

  it("saves a body written in full under its stored title and summary", async () => {
    const { service: current, update } = await fixture();

    const outcome = await update({
      content: "# The round\n\nNo round is open.\n",
    });

    expect(outcome).toMatchObject({ success: true });
    const replaced = await stored(current);
    expect(replaced.content).toContain("No round is open.");
    expect(replaced.metadata).toMatchObject({
      title: "The round",
      summary: "What the round asks.",
    });
  });

  it("takes the title and summary a replacement states", async () => {
    const { service: current, update } = await fixture();

    const outcome = await update({
      content:
        "---\ntitle: The plan\nsummary: What the plan is now.\n---\n# The plan\n\nNo round is open.\n",
    });

    expect(outcome).toMatchObject({ success: true });
    const replaced = await stored(current);
    expect(replaced.content).toContain("No round is open.");
    expect(replaced.metadata).toMatchObject({
      title: "The plan",
      summary: "What the plan is now.",
    });
  });
});
