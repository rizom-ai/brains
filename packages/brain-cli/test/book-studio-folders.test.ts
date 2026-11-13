import { afterEach, describe, expect, test } from "bun:test";
import bookPackage from "@brains/book";
import {
  createEditorRoutes,
  StudioWorkspaceRegistry,
  studioContextOn,
} from "@brains/studio/test";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * Studio's tree of a book's sections on the brain's own entity store: a
 * folder a section stands in is titled by the section's headings, as the
 * book-section adapter titled it.
 */

const opened: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close();
});

const readOnly = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
} as const;

/** The book package on a real entity store, as the brain composes it. */
async function store(): Promise<DeclaredEntityStore> {
  const result = await declaredEntityStore(
    bookPackage,
    "@brains/book",
    { pluginId: "book", ownedTypePluginId: "book-entity" },
    (entityType) =>
      entityType === "book-section"
        ? {
            classification: "content",
            defaultSort: [{ field: "id", direction: "asc" }],
            actionPolicy: readOnly,
            containedIn: "book",
          }
        : { classification: "content", actionPolicy: readOnly },
  );
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
  shell: DeclaredEntityStore["shell"],
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
      // The book opens its folder, its file's header shown as written.
      entities: [
        {
          id: "zara",
          entityType: "book",
          displayTitle: "Also sprach Zarathustra",
          frontmatter: {
            title: "Also sprach Zarathustra",
            source: "https://example.org/zara",
            visibility: "public",
          },
        },
        { id: "zara:00001-vorrede" },
      ],
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
