import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  restatingMetadata,
  type AnyEntityDefinition,
} from "../src";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A first-party type whose encode writes what its metadata did not state —
 * a slug resolved from the title — stores the metadata as the written
 * document states it, so later writes read what the file now says: once
 * stored, the slug is the file's own and is written where a stated slug is,
 * as the entity plugin classes' adapters wrote it. A type that restates
 * nothing stores its metadata as it was handed.
 */

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const metadata = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  authoredSlug: z.boolean().optional(),
});

function slugged(type: string): AnyEntityDefinition {
  return defineEntity({
    type,
    purpose: "Slugged.",
    metadata,
    markdown: {
      decode: ({ content, frontmatter }) => {
        const stated = z
          .object({
            title: z.string(),
            slug: z.string().optional(),
            status: z.string(),
          })
          .parse(frontmatter);
        return {
          content,
          metadata: {
            ...stated,
            slug: stated.slug ?? slugify(stated.title),
            ...(stated.slug !== undefined && { authoredSlug: true }),
          },
        };
      },
      // A stated slug where the file states it; a resolved one after.
      encode: ({ content, metadata: written }) => ({
        content,
        frontmatter: {
          title: written.title,
          ...(written.authoredSlug === true && { slug: written.slug }),
          status: written.status,
          ...(written.authoredSlug !== true && { slug: written.slug }),
        },
      }),
    },
  });
}

const restated = restatingMetadata(slugged("restated"), (stored) => ({
  ...stored,
  authoredSlug: true,
}));
const plain = slugged("plain");

async function store(): Promise<{
  service: EntityService;
  stored: (type: string, id: string) => Promise<string>;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "slugged", entities: [restated, plain] }),
    {},
    { name: "@fixture/slugged", version: "0.1.0" },
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
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  return {
    service,
    stored: async (entityType, id) =>
      (
        await service.getEntity({
          entityType,
          id,
          visibilityScope: "restricted",
          source: true,
        })
      )?.content ?? "",
  };
}

async function importThenEdit(
  type: string,
): Promise<{ imported: string; edited: string; slugStated: unknown }> {
  const { service, stored } = await store();
  await service.createEntityFromMarkdown({
    input: {
      entityType: type,
      id: "one",
      markdown: "---\ntitle: No Slug\nstatus: draft\n---\nBody\n",
    },
  });
  const imported = await stored(type, "one");
  const read = await service.getEntity({ entityType: type, id: "one" });
  if (!read) throw new Error("Missing record");
  await service.updateEntity({
    entity: { ...read, content: read.content.replace("Body", "Edited") },
  });
  const edited = await stored(type, "one");
  const after = await service.getEntity({ entityType: type, id: "one" });
  return { imported, edited, slugStated: after?.metadata["authoredSlug"] };
}

describe("a first-party type's restated metadata", () => {
  it("stores what the written document states, so the next write places it as stated", async () => {
    expect(await importThenEdit("restated")).toEqual({
      // The first write resolves the slug and writes it after the rest.
      imported:
        "---\ntitle: No Slug\nstatus: draft\nslug: no-slug\n---\nBody\n",
      // From then on the file states it.
      edited:
        "---\ntitle: No Slug\nslug: no-slug\nstatus: draft\n---\nEdited\n",
      slugStated: true,
    });
  });

  it("is the metadata as handed for a type that restates nothing", async () => {
    expect(await importThenEdit("plain")).toEqual({
      imported:
        "---\ntitle: No Slug\nstatus: draft\nslug: no-slug\n---\nBody\n",
      edited:
        "---\ntitle: No Slug\nstatus: draft\nslug: no-slug\n---\nEdited\n",
      slugStated: undefined,
    });
  });
});
