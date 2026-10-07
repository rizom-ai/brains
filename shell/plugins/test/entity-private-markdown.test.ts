import { expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EntityRegistry,
  EntityService,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/test";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";
import { createMockShell } from "../src/test/mock-shell";

it("persists and reopens strict private Markdown without exposing its envelope to the codec", async () => {
  const directory = await mkdtemp(join(tmpdir(), "private-markdown-"));
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const frontmatter = z.strictObject({ person: z.string() });
  const definition = defineEntity({
    type: "private-record",
    purpose: "Private operational record",
    metadata: z.object({ title: z.literal("Private record") }),
    config: {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
    },
    validatePersist: ({ visibility }) => {
      if (visibility !== "restricted")
        throw new Error("Restricted records only");
    },
    markdown: {
      frontmatter,
      decode: ({ content, frontmatter: fields }) => ({
        content: generateMarkdownWithFrontmatter(
          content,
          frontmatter.parse(fields),
        ),
        metadata: { title: "Private record" as const },
      }),
      encode: ({ content }) => {
        const parsed = parseMarkdownWithFrontmatter(content, frontmatter);
        return { content: parsed.content, frontmatter: parsed.metadata };
      },
    },
  });
  const dbConfig = { url: `file:${join(directory, "entities.db")}` };
  await migrateEntities(dbConfig, logger);
  const open = (): EntityService =>
    EntityService.createFresh({
      entityRegistry: registry,
      logger,
      jobQueueService: createMockJobQueueService(),
      embeddingsEnabled: false,
      embeddingService: {
        dimensions: 1536,
        generateEmbedding: async () => {
          throw new Error("No embeddings");
        },
        generateEmbeddings: async () => {
          throw new Error("No embeddings");
        },
      },
      dbConfig,
      embeddingDbConfig: { url: `file:${join(directory, "embeddings.db")}` },
    });
  let service = open();
  const shell = createMockShell();
  shell.getEntityRegistry = (): EntityRegistry => registry;
  shell.getEntityService = (): EntityService => service;
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "private-record", entities: [definition] }),
    {},
    { name: "@test/private", version: "0.0.0" },
  );
  try {
    await service.initialize();
    for (const plugin of plugins) await plugin.register(shell);
    const input = {
      id: "one",
      entityType: definition.type,
      visibility: "restricted" as const,
      content: generateMarkdownWithFrontmatter("Private message", {
        person: "private@example.com",
      }),
      metadata: { title: "Private record" },
    };
    await service.createEntity({
      entity: input,
      options: { conditionalWrite: { expectedRevision: null } },
    });
    service.close();
    service = open();
    await service.initialize();
    expect(
      await service.getEntity({ entityType: definition.type, id: "one" }),
    ).toBeNull();
    const stored = await service.getEntity({
      entityType: definition.type,
      id: "one",
      visibilityScope: "restricted",
    });
    if (!stored) throw new Error("Missing private record");
    expect(stored.metadata).toEqual({ title: "Private record" });
    expect(
      parseMarkdownWithFrontmatter(stored.content, frontmatter).metadata,
    ).toEqual({ person: "private@example.com" });
    const refused = await service
      .createEntity({
        entity: { ...input, id: "public", visibility: "public" },
      })
      .catch((error: unknown) => error);
    expect(refused).toEqual(new Error("Restricted records only"));
    expect(
      (
        await service.updateEntity({
          entity: {
            ...stored,
            content: generateMarkdownWithFrontmatter("Changed message", {
              person: "private@example.com",
            }),
          },
          options: { expectedContentHash: stored.contentHash },
        })
      ).skipped,
    ).toBe(false);
  } finally {
    for (const plugin of plugins) await plugin.shutdown?.();
    service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
