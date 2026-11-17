import { describe, expect, it } from "bun:test";
import { siteBuildStagingContract } from "@brains/contracts";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import { createBookPlugins } from "./book-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}

async function installed(
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const plugins = createBookPlugins();
  const capabilities = await registerAll(shell, plugins, options);
  return { shell, plugins, capabilities };
}

const readOnly = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
};

/**
 * What the book package registers, pinned as the book entity plugin class
 * registered it and held on the definition: brains search and cite books and their sections by these
 * types, sites render them through these templates and data sources, and
 * every site build stages each book's EPUB.
 */
describe("the book package's registered surface", () => {
  it("is the book service beside its two types, with no tools, resources, routes or jobs", async () => {
    const { shell, plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      // The class registered both types inside itself, under book; the
      // types now install as their own plugins, book apart from the service.
      ["book-entity", "entity", "@brains/book", []],
      ["book-section", "entity", "@brains/book", []],
      ["book", "service", "@brains/book", []],
    ]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
  });

  it("registers books and their sections, read-only, sections in their book", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["book", "book-section"]);
    expect(registry.getEntityTypeConfig("book")).toMatchObject({
      classification: "content",
      includeInBroadSearch: true,
      projectionSource: false,
      projectionSourceRole: "excluded",
      actionPolicy: readOnly,
    });
    expect(registry.getEntityTypeConfig("book-section")).toMatchObject({
      classification: "content",
      includeInBroadSearch: true,
      projectionSourceRole: "canonical",
      defaultSort: [{ field: "id", direction: "asc" }],
      actionPolicy: readOnly,
      containedIn: "book",
    });
    expect(
      registry.getEntityTypeConfig("book-section").projectionSource,
    ).not.toBe(false);
  });

  it("tells the agent to search and cite the sections", async () => {
    const { capabilities } = await installed();
    expect(
      capabilities.flatMap(({ instructions }) =>
        instructions === undefined ? [] : [instructions],
      ),
    ).toEqual([
      [
        'Books (entityType "book") hold an author\'s works; their text is in their sections (entityType "book-section"), whose `section` is their siglum.',
        'When a question concerns the author\'s ideas or texts, search the sections first: system_search with scope { kind: "type", entityType: "book-section" }.',
        "Ground every claim in sections you found, and cite each section by its siglum and its book's title.",
        "Quote the text verbatim, in the language of the text, even when you answer in another language.",
        "When the books hold nothing on the question, say that the books do not address it instead of answering from general knowledge.",
      ].join("\n"),
    ]);
  });

  it("registers its templates and data sources under book", async () => {
    const { shell } = await installed();
    expect([...shell.getTemplates().keys()].sort()).toEqual([
      "book:ask",
      "book:book-detail",
      "book:book-list",
      "book:book-section-detail",
      "book:epub",
      "book:theme",
    ]);
    expect(
      shell
        .getDataSourceRegistry()
        .list()
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["book:ask", "book:entities", "book:theme"]);
  });

  it("stages each book's EPUB in every process a site builds in", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({ executionOnly });
      expect(
        shell.getMessageBus().getHandlerCount(siteBuildStagingContract.name),
      ).toBe(1);
    }
  });
});
