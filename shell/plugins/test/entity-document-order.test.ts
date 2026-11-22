import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
} from "../src";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A first-party type whose files people write by hand keeps each file's
 * own frontmatter order, as an entity plugin class's adapter did, so
 * directory sync does not rewrite a file it only read: the values the type
 * writes land where the file has them, and a field the file lacks follows
 * the rest. A type that does not ask writes its own order.
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
    decode: ({ content, frontmatter }) => {
      const header = z
        .object({
          status: z.string(),
          title: z.string(),
          sourceRef: z.string(),
          sourceLabel: z.string(),
        })
        .parse(frontmatter);
      return {
        content,
        metadata: {
          status: header.status,
          title: header.title,
          source: { ref: header.sourceRef, label: header.sourceLabel },
        },
      };
    },
    // The header is flat (docs/plans/one-stored-form.md): the nested
    // source is stated as two keys.
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: {
        status: metadata.status,
        title: metadata.title,
        sourceRef: metadata.source.ref,
        sourceLabel: metadata.source.label,
      },
    }),
  },
});

const handWritten =
  "---\ntitle: Saved\nnote: kept here\nstatus: draft\nsourceLabel: CLI\nsourceRef: cli:local\n---\nSummary\n";

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
    if (isDeclaredEntityType(plugin)) {
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
    embeddingService: createRefusingEmbeddingService(),
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

// Every type keeps the order of the document it replaces
// (docs/plans/one-stored-form.md).
describe("a type writes in the document's order", () => {
  it("keeps a hand-written file's order and the fields it does not write", async () => {
    const { service, stored } = await store(link);
    await service.createEntityFromMarkdown({
      input: { entityType: "link", id: "saved", markdown: handWritten },
    });
    expect(await stored("saved")).toBe(
      "---\ntitle: Saved\nnote: kept here\nstatus: draft\nsourceLabel: CLI\nsourceRef: 'cli:local'\n---\nSummary\n",
    );
  });

  it("keeps it through an update of the body, and writes a changed value in place", async () => {
    const { service, stored } = await store(link);
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
      "---\ntitle: Saved\nnote: kept here\nstatus: published\nsourceLabel: CLI\nsourceRef: 'cli:local'\n---\nChanged summary\n",
    );
  });

  it("keeps the record dates a hand-written file states, as the class kept them", async () => {
    const { service, stored } = await store(link);
    await service.createEntityFromMarkdown({
      input: {
        entityType: "link",
        id: "dated",
        markdown:
          "---\ntitle: Dated\nstatus: draft\nsourceRef: cli:local\nsourceLabel: CLI\ncreated: 2025-09-20T00:00:00.000Z\nupdated: 2025-09-20T00:00:00.000Z\n---\nSummary\n",
      },
    });
    expect(await stored("dated")).toBe(
      "---\ntitle: Dated\nstatus: draft\nsourceRef: 'cli:local'\nsourceLabel: CLI\ncreated: '2025-09-20T00:00:00.000Z'\nupdated: '2025-09-20T00:00:00.000Z'\n---\nSummary\n",
    );
  });

  it("writes a field the file lacks after the rest", async () => {
    const { service, stored } = await store(link);
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
      "---\ntitle: Made\nstatus: draft\nsourceRef: 'cli:local'\nsourceLabel: CLI\n---\nBody\n",
    );
  });
});

describe("a codec's header", () => {
  it("is refused when it nests, at the write", async () => {
    const nesting = defineEntity({
      type: "bookmark",
      purpose: "A bookmark whose codec nests its header.",
      metadata: z.object({ source: z.object({ ref: z.string() }) }),
      markdown: {
        decode: ({ content, frontmatter }) => ({
          content,
          metadata: z
            .object({ source: z.object({ ref: z.string() }) })
            .parse(frontmatter),
        }),
        encode: ({ content, metadata }) => ({
          content,
          frontmatter: { source: { ref: metadata.source.ref } },
        }),
      },
    });
    const { service } = await store(nesting);
    expect(
      service.createEntity({
        entity: {
          id: "one",
          entityType: "bookmark",
          content: "Body",
          metadata: { source: { ref: "cli:local" } },
        },
      }),
    ).rejects.toThrow("bookmark's codec wrote a header that nests source");
  });
});
