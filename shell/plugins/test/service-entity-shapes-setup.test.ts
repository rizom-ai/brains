import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { baseEntitySchema, type BaseEntity } from "@brains/entity-service";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type EntityAdapter,
  type ServiceEntityShapes,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/** A type whose markdown means something, as its own adapter says. */
function noteAdapter(): EntityAdapter<BaseEntity> {
  return {
    entityType: "note",
    schema: baseEntitySchema,
    purpose: "A note somebody wrote.",
    hasBody: true,
    fromMarkdown: (markdown) => ({
      content: markdown,
      metadata: { title: markdown.split("\n")[0] ?? "" },
    }),
    toMarkdown: (entity: BaseEntity) => entity.content,
    extractMetadata: () => ({}),
    parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>): T =>
      schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
  };
}

/** A type that is its frontmatter and nothing else. */
function settingsAdapter(): EntityAdapter<BaseEntity> {
  return { ...noteAdapter(), entityType: "settings", hasBody: false };
}

/**
 * What shape each entity type takes, read where an editor needs it.
 *
 * A console assembles an entity from a form: it validates the frontmatter
 * against the type's schema, refuses a body for a type that has none, and
 * parses the markdown it wrote through the type's own adapter, because that
 * adapter is what says what the markdown means. It does all of this in a
 * route handler, so the reads have to be there at setup rather than only at
 * ready. Named consumer: @brains/studio.
 */
describe("entity shapes, read at setup", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-shapes-setup-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<ServiceEntityShapes> {
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, noteAdapter());
    harness
      .getEntityRegistry()
      .registerEntityType("settings", baseEntitySchema, settingsAdapter());

    let captured: ServiceEntityShapes | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "studio",
        config: z.object({}),
        setup: ({ entityShapes }) => {
          captured = entityShapes;
          return {};
        },
      }),
      {},
      { name: "@fixture/studio", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  it("answers the frontmatter schema of a registered type, and nothing for an unknown one", async () => {
    const shapes = await install();

    expect(shapes.frontmatterSchema("note")).toBeDefined();
    expect(shapes.frontmatterSchema("ghost")).toBeUndefined();
  });

  it("says whether a type carries a body", async () => {
    const shapes = await install();

    expect(shapes.hasBody("note")).toBe(true);
    expect(shapes.hasBody("settings")).toBe(false);
  });

  it("parses markdown through the type's own adapter", async () => {
    const shapes = await install();

    expect(shapes.parse("note", "A title\n\nAnd a body")).toMatchObject({
      content: "A title\n\nAnd a body",
      metadata: { title: "A title" },
    });
  });

  it("parses nothing for a type nobody registered", async () => {
    const shapes = await install();

    expect(shapes.parse("ghost", "whatever")).toBeUndefined();
  });
});
