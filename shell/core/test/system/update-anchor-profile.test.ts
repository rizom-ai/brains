import { afterEach, expect, test } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { AnchorProfileAdapter } from "@brains/identity-service";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";

let service: EntityService | undefined;
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  service?.close();
  await cleanup?.();
});

const confirmation = z.object({
  needsConfirmation: z.literal(true),
  args: z.record(z.string(), z.unknown()),
});

const placeholder =
  "---\nname: Your Name Here\nemail: hello@example.com\nwebsite: https://example.com\ntagline: Building things\n---\n\nThis is where your story goes.\n";

test("a content replacement stores the new anchor name, email, and website", async () => {
  const directory = await createTestDirectory();
  cleanup = directory.cleanup;
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const adapter = new AnchorProfileAdapter();
  registry.registerEntityType(adapter.entityType, adapter.schema, adapter);
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
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  await service.createEntity({
    entity: {
      id: "anchor-profile",
      entityType: "anchor-profile",
      content: placeholder,
      metadata: {},
    },
  });
  const tool = createEntityUpdateTool(
    createMockSystemServices({
      entityRegistry: registry,
      entityService: service,
    }),
  );
  const exec = (
    input: Record<string, unknown>,
  ): ReturnType<typeof tool.handler> =>
    tool.handler(input, {
      interfaceType: "test",
      actor: { kind: "user", userId: "editor" },
      userPermissionLevel: "admin",
    });

  const replacement = placeholder
    .replace("Your Name Here", "Mira Okonkwo")
    .replace("hello@example.com", "mira@example.com")
    .replace("https://example.com", "https://mira.example")
    .replace("Building things", "Calm software");
  const proposal = confirmation.parse(
    await exec({
      entityType: "anchor-profile",
      id: "anchor-profile",
      operation: { kind: "content", content: replacement },
    }),
  );
  expect(await exec(proposal.args)).toMatchObject({ success: true });

  const saved = await service.getEntity({
    entityType: "anchor-profile",
    id: "anchor-profile",
  });
  if (!saved) throw new Error("Missing anchor profile");
  expect(adapter.parseProfileBody(saved.content)).toMatchObject({
    name: "Mira Okonkwo",
    email: "mira@example.com",
    website: "https://mira.example",
  });
  expect(saved.content).toContain("tagline: Calm software");
  expect(saved.content).not.toContain("Your Name Here");
  expect(saved.metadata).toMatchObject({ name: "Mira Okonkwo" });
  expect(service.serializeEntity(saved)).toContain("name: Mira Okonkwo");
});
