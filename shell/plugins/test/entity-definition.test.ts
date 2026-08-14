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
          content:
            "---\nsourceId: saved-page\nvisibility: shared\n---\nUseful page\n",
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

  it("registers declared entity-type config with the entity registry", async () => {
    // System-configuration entity types opt out of search embeddings and
    // projection sourcing. Without a declarative slot for this, the
    // surface silently takes the embeddable/projectionSource defaults of
    // true, which would start embedding configuration as user content.
    const setting = defineEntity({
      type: "setting",
      purpose: "System configuration, not user content.",
      metadata: z.object({ target: z.string() }),
      config: {
        embeddable: false,
        projectionSource: false,
        projectionSourceRole: "excluded",
      },
    });
    const definition = defineEntityPackage({
      id: "settings",
      entities: [setting],
    });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/settings", version: "0.1.0" },
      (id) => `@fixture/settings:${id}`,
    )[0];
    if (!plugin) throw new Error("Setting entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-config-test"),
    });
    await harness.installPlugin(plugin);

    expect(
      harness.getEntityService().getEntityTypeConfig("setting"),
    ).toMatchObject({
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    harness.reset();
  });

  it("registers no entity-type overrides when config is not declared", async () => {
    const plain = defineEntity({
      type: "plain",
      purpose: "An ordinary entity that takes the defaults.",
      metadata: z.object({ title: z.string() }),
    });
    const definition = defineEntityPackage({
      id: "plain-pkg",
      entities: [plain],
    });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/plain", version: "0.1.0" },
      (id) => `@fixture/plain:${id}`,
    )[0];
    if (!plugin) throw new Error("Plain entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-config-default-test"),
    });
    await harness.installPlugin(plugin);

    expect(harness.getEntityService().getEntityTypeConfig("plain")).toEqual({});

    harness.reset();
  });
});

describe("declarative entity seeding", () => {
  const seeded = defineEntity({
    type: "house-style",
    purpose: "A singleton the brain needs present even before anyone edits it.",
    metadata: z.object({}),
    seed: {
      on: "content-sync-completed",
      id: "house-style",
      content: () => "# House style\n\nWrite plainly.",
    },
  });

  async function installSeeded(): Promise<
    ReturnType<typeof createPluginHarness>
  > {
    const plugin = createEntityPackagePlugins(
      [seeded],
      [],
      { name: "@fixture/house-style", version: "0.1.0" },
      (id) => `@fixture/house-style:${id}`,
    )[0];
    if (!plugin) throw new Error("Seeded entity plugin was not created");
    const harness = createPluginHarness({
      logger: createSilentLogger("seed-test"),
    });
    await harness.installPlugin(plugin);
    return harness;
  }

  async function readSeed(
    harness: ReturnType<typeof createPluginHarness>,
  ): Promise<unknown> {
    return harness.getEntityService().getEntity({
      entityType: "house-style",
      id: "house-style",
    });
  }

  it("does not create the entity before the signal fires", async () => {
    const harness = await installSeeded();
    expect(await readSeed(harness)).toBeNull();
    harness.reset();
  });

  it("creates the entity when the signal fires", async () => {
    const harness = await installSeeded();
    await harness.sendMessage("sync:initial:completed", {});

    const entity = await readSeed(harness);
    expect(entity).toMatchObject({
      id: "house-style",
      entityType: "house-style",
    });
    expect((entity as { content: string }).content).toContain("Write plainly.");

    harness.reset();
  });

  it("leaves an existing entity untouched", async () => {
    const harness = await installSeeded();
    await harness.getEntityService().createEntity({
      entity: {
        id: "house-style",
        entityType: "house-style",
        content: "# House style\n\nAuthored by a human.",
        metadata: {},
      },
    });

    await harness.sendMessage("sync:initial:completed", {});

    const entity = await readSeed(harness);
    expect((entity as { content: string }).content).toContain(
      "Authored by a human.",
    );

    harness.reset();
  });

  it("is inert for entities that declare no seed", async () => {
    const plain = defineEntity({
      type: "unseeded",
      purpose: "No seed declared.",
      metadata: z.object({}),
    });
    const plugin = createEntityPackagePlugins(
      [plain],
      [],
      { name: "@fixture/unseeded", version: "0.1.0" },
      (id) => `@fixture/unseeded:${id}`,
    )[0];
    if (!plugin) throw new Error("Unseeded entity plugin was not created");
    const harness = createPluginHarness({
      logger: createSilentLogger("seed-inert-test"),
    });
    await harness.installPlugin(plugin);

    await harness.sendMessage("sync:initial:completed", {});
    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "unseeded", id: "unseeded" }),
    ).toBeNull();

    harness.reset();
  });
});
