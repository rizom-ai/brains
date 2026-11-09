import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  writesInDocumentOrder,
  type AnyEntityDefinition,
} from "../src";

/**
 * A first-party type whose files people write by hand keeps each file's
 * own frontmatter order, as an entity plugin class's adapter did, so
 * directory sync does not rewrite a file it only read: the values the type
 * writes land where the file has them, a nested value it writes unchanged
 * keeps the file's own key order, and a field the file lacks follows the
 * rest. A type that does not ask writes its own order.
 */

const link = defineEntity({
  type: "link",
  purpose: "A saved page.",
  metadata: z.object({
    status: z.string(),
    title: z.string(),
    source: z.object({ ref: z.string(), label: z.string() }),
  }),
  markdown: {
    decode: ({ content, frontmatter }) => ({
      content,
      metadata: z
        .object({
          status: z.string(),
          title: z.string(),
          source: z.object({ ref: z.string(), label: z.string() }),
        })
        .parse(frontmatter),
    }),
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: {
        status: metadata.status,
        title: metadata.title,
        source: { ref: metadata.source.ref, label: metadata.source.label },
      },
    }),
  },
});

const ordered = writesInDocumentOrder(link);

const handWritten =
  "---\ntitle: Saved\nnote: kept here\nstatus: draft\nsource:\n  label: CLI\n  ref: cli:local\n---\nSummary\n";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function store(definition: AnyEntityDefinition): Promise<{
  service: EntityService;
  stored: (id: string) => Promise<string>;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "pages", entities: [definition] }),
    {},
    { name: "@fixture/pages", version: "0.1.0" },
  )) {
    if (plugin instanceof EntityPlugin) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
      );
    }
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
  return {
    service,
    // The stored document, as the entity store holds it.
    stored: async (id) =>
      (
        await service.getEntity({
          entityType: definition.type,
          id,
          visibilityScope: "restricted",
          source: true,
        })
      )?.content ?? "",
  };
}

describe("a type that writes in the document's order", () => {
  it("keeps a hand-written file's order, nested keys and the fields it does not write", async () => {
    const { service, stored } = await store(ordered);
    await service.createEntityFromMarkdown({
      input: { entityType: "link", id: "saved", markdown: handWritten },
    });
    expect(await stored("saved")).toBe(
      "---\ntitle: Saved\nnote: kept here\nstatus: draft\nsource:\n  label: CLI\n  ref: 'cli:local'\n---\nSummary\n",
    );
  });

  it("keeps it through an update of the body, and writes a changed value in place", async () => {
    const { service, stored } = await store(ordered);
    await service.createEntityFromMarkdown({
      input: { entityType: "link", id: "saved", markdown: handWritten },
    });
    const read = await service.getEntity({ entityType: "link", id: "saved" });
    if (!read) throw new Error("Missing link");
    await service.updateEntity({
      entity: {
        ...read,
        content: "Changed summary",
        metadata: { ...read.metadata, status: "published" },
      },
    });
    expect(await stored("saved")).toBe(
      "---\ntitle: Saved\nnote: kept here\nstatus: published\nsource:\n  label: CLI\n  ref: 'cli:local'\n---\nChanged summary\n",
    );
  });

  it("keeps the record dates a hand-written file states, as the class kept them", async () => {
    const { service, stored } = await store(ordered);
    await service.createEntityFromMarkdown({
      input: {
        entityType: "link",
        id: "dated",
        markdown:
          "---\ntitle: Dated\nstatus: draft\nsource:\n  ref: cli:local\n  label: CLI\ncreated: 2025-09-20T00:00:00.000Z\nupdated: 2025-09-20T00:00:00.000Z\n---\nSummary\n",
      },
    });
    expect(await stored("dated")).toBe(
      "---\ntitle: Dated\nstatus: draft\nsource:\n  ref: 'cli:local'\n  label: CLI\ncreated: '2025-09-20T00:00:00.000Z'\nupdated: '2025-09-20T00:00:00.000Z'\n---\nSummary\n",
    );
  });

  it("writes a field the file lacks after the rest", async () => {
    const { service, stored } = await store(ordered);
    await service.createEntity({
      entity: {
        id: "made",
        entityType: "link",
        content: "---\ntitle: Made\nstatus: draft\n---\nBody",
        metadata: {
          title: "Made",
          status: "draft",
          source: { ref: "cli:local", label: "CLI" },
        },
      },
    });
    expect(await stored("made")).toBe(
      "---\ntitle: Made\nstatus: draft\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nBody\n",
    );
  });
});

describe("a type that does not ask", () => {
  it("writes its own order", async () => {
    const { service, stored } = await store(link);
    await service.createEntityFromMarkdown({
      input: { entityType: "link", id: "saved", markdown: handWritten },
    });
    expect(await stored("saved")).toBe(
      "---\nstatus: draft\ntitle: Saved\nsource:\n  ref: 'cli:local'\n  label: CLI\nnote: kept here\n---\nSummary\n",
    );
  });
});
