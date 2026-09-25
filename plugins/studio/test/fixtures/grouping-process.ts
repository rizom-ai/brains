import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { noteAdapter, noteSchema } from "@brains/note";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { registerGroupingDefinitions } from "../../src/grouping-definitions";

const commandSchema = z.object({
  id: z.number(),
  action: z.enum(["define", "note", "read", "pause", "close"]),
  value: z.unknown().optional(),
});
const dir = process.argv[2];
if (!dir || !process.send)
  throw new Error("Run this fixture using the process test harness");
const logger = createSilentLogger();
const dbConfig = { url: `file:${dir}/entities.db` };
await migrateEntities(dbConfig, logger);
const registry = EntityRegistry.createFresh(logger);
registry.registerEntityType("note", noteSchema, noteAdapter);
const shell = createMockShell();
const service = EntityService.createFresh({
  dbConfig,
  embeddingDbConfig: { url: `file:${dir}/embeddings.db` },
  entityRegistry: registry,
  logger,
  jobQueueService: shell.getJobQueueService(),
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
shell.getEntityRegistry = (): EntityRegistry => registry;
shell.getEntityService = (): EntityService => service;
registerGroupingDefinitions(createServicePluginContext(shell, "studio"));
await service.reprojectRegisteredGroupings();
let paused = false;
const project = registry.projectStoredMetadata.bind(registry);
registry.projectStoredMetadata = (...args): Record<string, unknown> => {
  if (paused) throw new Error("Test scan interrupted");
  return project(...args);
};

process.on("message", (message: unknown): void => {
  const command = commandSchema.parse(message);
  void execute(command).then(
    (value) => {
      process.send?.({ id: command.id, value });
      if (command.action === "close") process.disconnect();
    },
    (error) => {
      process.send?.({ id: command.id, error: getErrorMessage(error) });
    },
  );
});
process.send({ id: 0, value: "ready" });

async function execute(
  command: z.output<typeof commandSchema>,
): Promise<unknown> {
  if (command.action === "close") {
    service.close();
    return null;
  }
  if (command.action === "pause") {
    paused = z.boolean().parse(command.value);
    return null;
  }
  if (command.action === "read") {
    if (!(await service.ensureGroupingsReady())) return { ready: false };
    if (!registry.getGroupings().length) return { ready: true, values: [] };
    const page = await service.queryGroupingCatalog({
      grouping: "areas",
      entityTypes: ["note"],
      visibilityScope: "shared",
    });
    return { ready: true, values: page.values };
  }
  const definitions = command.action === "define";
  const entityType = definitions ? "grouping-definitions" : "note";
  const id = definitions ? entityType : "member";
  const content = generateMarkdown(
    definitions
      ? { groupings: command.value, visibility: "shared" }
      : { title: "Member", areas: z.array(z.string()).parse(command.value) },
    "",
  );
  const existing = await service.getEntityRaw({
    entityType,
    id,
    visibilityScope: "shared",
  });
  if (existing)
    await service.updateEntity({ entity: { ...existing, content } });
  else
    await service.createEntityFromMarkdown({
      input: { entityType, id, markdown: content, visibility: "shared" },
    });
  return null;
}
