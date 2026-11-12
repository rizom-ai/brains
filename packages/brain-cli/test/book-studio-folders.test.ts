import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  bookAdapter,
  bookPlugin,
  bookSchema,
  bookSectionAdapter,
  bookSectionSchema,
} from "@brains/book";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "@brains/plugins/test";
import {
  createEditorRoutes,
  StudioWorkspaceRegistry,
  studioContextOn,
} from "@brains/studio/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";

/**
 * Studio's tree of a book's sections on the brain's own entity store: a
 * folder a section stands in is titled by the section's headings, as the
 * book-section adapter titled it.
 */

interface Opened {
  service: EntityService;
  shell: ReturnType<typeof createMockShell>;
  close(): void;
}

const opened: Opened[] = [];
afterEach(() => {
  for (const store of opened.splice(0)) store.close();
});

/** The book plugin on a real entity store, as the brain composes it. */
async function store(): Promise<Opened> {
  const temporary = await createTestDirectory();
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${temporary.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const shell = createMockShell({ logger });
  await bookPlugin().register(shell);
  const registry = EntityRegistry.createFresh(logger);
  const source = shell.getEntityRegistry();
  registry.registerEntityType(
    "book",
    bookSchema,
    bookAdapter,
    source.getEntityTypeConfig("book"),
  );
  registry.registerEntityType(
    "book-section",
    bookSectionSchema,
    bookSectionAdapter,
    source.getEntityTypeConfig("book-section"),
  );
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${temporary.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  const studioShell = createMockShell({ logger, entityService: service });
  await bookPlugin().register(studioShell);
  const result = {
    service,
    shell: studioShell,
    close: (): void => {
      createClient(dbConfig).close();
      service.close();
    },
  };
  opened.push(result);
  return result;
}

const section = (
  title: string,
  order: number,
  headings: readonly string[],
): string =>
  `---\ntitle: ${title}\nbook: zara\norder: ${order}\nsource: https://example.org/zara/${order}\nheadings: ${JSON.stringify(headings)}\n---\nText ${order}.\n`;

async function hierarchy(
  shell: Opened["shell"],
  query: string,
): Promise<unknown> {
  const context = await studioContextOn(shell);
  const route = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
    resolveAuthPrincipal: async () => ({
      userId: "admin",
      personId: "admin",
      displayName: "Admin",
      role: "admin",
      permissionLevel: "admin",
      status: "active",
      isAnchor: true,
    }),
  }).find(
    (candidate) =>
      candidate.method === "GET" && candidate.path === "/studio/api/hierarchy",
  );
  if (!route) throw new Error("No hierarchy route");
  const response = await route.handler(
    new Request(`https://studio.test/studio/api/hierarchy?${query}`),
  );
  expect(response.status).toBe(200);
  return response.json();
}

describe("Studio's tree of a book's sections", () => {
  test("titles the folders a section stands in by its headings", async () => {
    const { service, shell } = await store();
    await service.createEntityFromMarkdown({
      input: {
        entityType: "book",
        id: "zara",
        markdown:
          "---\ntitle: Also sprach Zarathustra\nsource: https://example.org/zara\n---\n## Contents\n",
      },
    });
    await service.createEntityFromMarkdown({
      input: {
        entityType: "book-section",
        id: "zara:00001-vorrede",
        markdown: section("Vorrede", 1, []),
      },
    });
    await service.createEntityFromMarkdown({
      input: {
        entityType: "book-section",
        id: "zara:00002-erster-theil:00003-reden",
        markdown: section("Reden", 3, ["Erster Theil"]),
      },
    });

    expect(
      await hierarchy(
        shell,
        `type=book&prefix=${encodeURIComponent(JSON.stringify(["zara"]))}`,
      ),
    ).toMatchObject({
      prefix: ["zara"],
      folders: [
        {
          path: ["zara", "00002-erster-theil"],
          title: "Erster Theil",
          descendantCount: 1,
        },
      ],
    });
    expect(
      await hierarchy(
        shell,
        `type=book&prefix=${encodeURIComponent(JSON.stringify(["zara", "00002-erster-theil"]))}`,
      ),
    ).toMatchObject({
      prefix: ["zara", "00002-erster-theil"],
      trail: ["Also sprach Zarathustra", "Erster Theil"],
    });
  });
});
