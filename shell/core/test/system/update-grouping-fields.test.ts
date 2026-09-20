import { afterEach, expect, test } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  EntityRegistry,
  EntityService,
  generateMarkdownWithFrontmatter,
  type BaseEntity,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";

const metadataSchema = z.object({ title: z.string() });
const schema = baseEntitySchema.extend({
  entityType: z.literal("entry"),
  metadata: metadataSchema,
});
class StrippingAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "entry",
      purpose: "Owner-stripping persistence canary",
      schema,
      frontmatterSchema: metadataSchema,
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return {
      content,
      metadata: this.parseFrontMatter(content, metadataSchema),
    };
  }
  override toMarkdown(entity: BaseEntity): string {
    return generateMarkdownWithFrontmatter(
      this.extractBody(entity.content),
      this.parseFrontMatter(entity.content, metadataSchema),
    );
  }
}
let service: EntityService | undefined;
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  service?.close();
  await cleanup?.();
});
async function fixture(
  clientsValue: unknown = ["Acme", "Comma, name"],
  lateRegistration = false,
): Promise<{
  service: EntityService;
  exec: (
    input: Record<string, unknown>,
  ) => ReturnType<ReturnType<typeof createEntityUpdateTool>["handler"]>;
}> {
  const directory = await createTestDirectory();
  cleanup = directory.cleanup;
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("entry", schema, new StrippingAdapter());
  const register = (): void => {
    for (const field of ["clients", "projects"])
      registry.registerGrouping({
        key: field,
        field,
        label: field,
        types: ["entry"],
      });
  };
  if (!lateRegistration) register();
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  service = EntityService.createFresh({
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
  const tool = createEntityUpdateTool(
    createMockSystemServices({
      entityRegistry: registry,
      entityService: service,
    }),
  );
  await service.createEntity({
    entity: {
      id: "same",
      entityType: "entry",
      content: `---\ntitle: Brief\nclients: ${JSON.stringify(clientsValue)}\nprojects: [Launch]\nunclaimed: null\n---\n\nBody`,
      metadata: { title: "Brief" },
    },
  });
  if (lateRegistration) register();
  return {
    service,
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
test("extension updates confirm source values and persist through owner stripping; removal and concurrent edits remain guarded", async () => {
  const { service, exec } = await fixture();
  const original = await service.getEntity({ entityType: "entry", id: "same" });
  if (!original) throw new Error("Missing entry");
  expect(original.metadata).not.toHaveProperty("clients");
  const input = {
    entityType: "entry",
    id: "same",
    fields: { clients: ["Beta"], projects: null },
  };
  const proposed = await exec(input);
  expect(proposed).toMatchObject({ needsConfirmation: true });
  const proposal = confirmation.parse(proposed);
  expect(proposal.preview).toContain(
    'clients: ["Acme","Comma, name"] → ["Beta"]',
  );
  expect(proposal.preview).toContain('projects: ["Launch"] → (removed)');
  expect(
    (await service.getEntity({ entityType: "entry", id: "same" }))?.content,
  ).toBe(original.content);
  await service.updateEntity({
    entity: {
      ...original,
      content: original.content.replace("Acme", "Concurrent"),
    },
  });
  expect(await exec(proposal.args)).toMatchObject({
    success: false,
    error: expect.stringContaining("modified"),
  });
  const refreshed = confirmation.parse(await exec(input));
  expect(refreshed.preview).toContain('["Concurrent","Comma, name"]');
  expect(await exec(refreshed.args)).toMatchObject({ success: true });
  expect(
    (
      await service.queryGroupingCatalog({
        grouping: "clients",
        entityTypes: ["entry"],
      })
    ).values,
  ).toEqual([{ value: "Beta", count: 1 }]);
  expect(
    (
      await service.queryGroupingCatalog({
        grouping: "projects",
        entityTypes: ["entry"],
      })
    ).total,
  ).toBe(0);
  const saved = await service.getEntity({ entityType: "entry", id: "same" });
  if (!saved) throw new Error("Missing saved entry");
  expect(service.serializeEntity(saved)).toContain("unclaimed: null");
  expect(service.serializeEntity(saved)).not.toContain("projects:");
  const removal = confirmation.parse(
    await exec({ entityType: "entry", id: "same", fields: { clients: null } }),
  );
  expect(removal.preview).toContain('clients: ["Beta"] → (removed)');
  expect(await exec(removal.args)).toMatchObject({ success: true });
  expect(
    (
      await service.queryGroupingCatalog({
        grouping: "clients",
        entityTypes: ["entry"],
      })
    ).total,
  ).toBe(0);
  expect(confirmation.parse(await exec(input)).preview).toContain(
    "clients: (absent)",
  );
});
test.each([null, "Acme", { name: "Acme" }, [3]])(
  "confirmation distinguishes malformed persisted values from absence: %j",
  async (oldValue) => {
    const { service, exec } = await fixture(oldValue, true);
    const result = confirmation.parse(
      await exec({
        entityType: "entry",
        id: "same",
        fields: { clients: ["Beta"] },
      }),
    );
    expect(result.preview).toContain(
      `clients: ${JSON.stringify(oldValue)} (invalid existing value) → ["Beta"]`,
    );
    expect(await exec(result.args)).toMatchObject({ success: true });
    const replacement = confirmation.parse(
      await exec({
        entityType: "entry",
        id: "same",
        content: "---\ntitle: Brief\n---\n\nReplacement",
      }),
    );
    expect(await exec(replacement.args)).toMatchObject({ success: true });
    expect(
      (
        await service.queryGroupingCatalog({
          grouping: "clients",
          entityTypes: ["entry"],
        })
      ).total,
    ).toBe(0);
  },
);
test("invalid extension writes cannot request confirmation or change source", async () => {
  const { service, exec } = await fixture();
  const original = await service.getEntity({ entityType: "entry", id: "same" });
  expect(
    await exec({ entityType: "entry", id: "same", fields: { clients: [12] } }),
  ).toMatchObject({ success: false });
  expect(
    (await service.getEntity({ entityType: "entry", id: "same" }))?.content,
  ).toBe(original?.content);
});
