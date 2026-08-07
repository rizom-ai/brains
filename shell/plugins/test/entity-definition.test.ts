import { describe, expect, expectTypeOf, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "../src/test/harness";
import {
  createEntityPackagePlugins,
  deriveProjectionUpserts,
} from "../src/entity/declarative-entity-plugin";
import {
  defineEntity,
  defineEntityPackage,
  defineProjection,
  instantiatePluginPackageDefinition,
  type EntityOf,
} from "../src";

describe("entity package definitions", () => {
  it("infers domain entities and creates a scoped package definition", async () => {
    const bookmark = defineEntity({
      type: "bookmark",
      purpose: "A saved page.",
      metadata: z.object({ tags: z.array(z.string()).default([]) }),
    });
    const digest = defineEntity({
      type: "digest",
      purpose: "A derived digest.",
      metadata: z.object({ sourceId: z.string() }),
    });
    const projection = defineProjection({
      id: "bookmark-digest",
      source: bookmark,
      target: digest,
      async project({ source, target }) {
        expectTypeOf(source.metadata.tags).toEqualTypeOf<string[]>();
        await target.upsert({
          id: source.id,
          content: source.content,
          visibility: source.visibility,
          metadata: { sourceId: source.id },
        });
      },
    });
    expect(
      await deriveProjectionUpserts(
        projection,
        {
          id: "saved-page",
          entityType: "bookmark",
          content: "Useful page",
          visibility: "shared",
          metadata: { tags: ["reference"] },
          contentHash: "hash",
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
        },
        new AbortController().signal,
      ),
    ).toEqual([
      {
        operation: "upsert",
        entity: {
          id: "saved-page",
          entityType: "digest",
          content: "Useful page",
          visibility: "shared",
          metadata: { sourceId: "saved-page" },
        },
      },
    ]);

    const definition = defineEntityPackage({
      id: "reading-library",
      entities: [bookmark, digest],
      projections: [projection],
    });

    expectTypeOf<
      EntityOf<typeof bookmark>["entityType"]
    >().toEqualTypeOf<"bookmark">();
    expect(definition).toMatchObject({
      family: "entity",
      id: "reading-library",
      entities: [bookmark, digest],
      projections: [projection],
    });

    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/reading-entities", version: "0.1.0" },
    );
    expect(
      plugins.map(({ id, packageName, version, type }) => ({
        id,
        packageName,
        version,
        type,
      })),
    ).toEqual([
      {
        id: "@fixture/reading-entities:bookmark",
        packageName: "@fixture/reading-entities",
        version: "0.1.0",
        type: "entity",
      },
      {
        id: "@fixture/reading-entities:digest",
        packageName: "@fixture/reading-entities",
        version: "0.1.0",
        type: "entity",
      },
    ]);

    const runtimePlugins = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/reading-entities", version: "0.1.0" },
      (id) => `@fixture/reading-entities:${id}`,
    );
    const bookmarkPlugin = runtimePlugins[0];
    if (!bookmarkPlugin) {
      throw new Error("Bookmark entity plugin was not created");
    }
    const entity = bookmarkPlugin.schema.parse({
      id: "saved-page",
      entityType: "bookmark",
      content: "Useful page",
      visibility: "public",
      metadata: {},
      contentHash: "hash",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
    });
    expect(entity.metadata).toEqual({ tags: [] });
    const markdown = bookmarkPlugin.adapter.toMarkdown(entity);
    expect(bookmarkPlugin.adapter.fromMarkdown(markdown)).toEqual({
      content: "Useful page",
      metadata: { tags: [] },
    });

    const harness = createPluginHarness({
      logger: createSilentLogger("declarative-entity-test"),
    });
    const capabilities = await harness.installPlugin(bookmarkPlugin);
    const digestPlugin = runtimePlugins[1];
    if (!digestPlugin) throw new Error("Digest entity plugin was not created");
    await harness.installPlugin(digestPlugin);
    expect(harness.getEntityService().getEntityTypes()).toEqual([
      "bookmark",
      "digest",
    ]);
    expect(capabilities.projectionRules?.map(({ id }) => id)).toEqual([
      "@fixture/reading-entities:bookmark-digest",
    ]);
  });

  it("supports typed custom markdown codecs without adapter boilerplate", () => {
    const article = defineEntity({
      type: "article",
      purpose: "A custom markdown article.",
      metadata: z.object({ title: z.string() }),
      markdown: {
        decode: ({ content, frontmatter }) => ({
          content,
          metadata: {
            title: z.string().parse(frontmatter["display_title"]),
          },
        }),
        encode: ({ content, metadata }) => ({
          content,
          frontmatter: { display_title: metadata.title },
        }),
      },
    });
    const definition = defineEntityPackage({
      id: "articles",
      entities: [article],
    });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/articles", version: "0.1.0" },
      (id) => `@fixture/articles:${id}`,
    )[0];
    if (!plugin) throw new Error("Article entity plugin was not created");

    const entity = plugin.schema.parse({
      id: "hello",
      entityType: "article",
      content: "Article body",
      visibility: "public",
      metadata: { title: "Hello" },
      contentHash: "hash",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
    });
    const markdown = plugin.adapter.toMarkdown(entity);
    expect(markdown).toContain("display_title: Hello");
    expect(plugin.adapter.fromMarkdown(markdown)).toEqual({
      content: "Article body",
      metadata: { title: "Hello" },
    });
  });
});
