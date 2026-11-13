import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withFolderTitles,
  type AnyEntityDefinition,
} from "../src";

/**
 * A first-party type whose records stand in folders it can name titles
 * them from the record, as its adapter's getFolderTitles did: a book
 * section's headings name the parts it stands in. A type that names none
 * leaves Studio its folder names.
 */

const sectionMetadata = z.object({
  title: z.string(),
  headings: z.array(z.string()),
});

const section = withFolderTitles(
  defineEntity({
    type: "section",
    purpose: "A section of a book.",
    metadata: sectionMetadata,
  }),
  ({ metadata }) => [undefined, ...metadata.headings],
);
const memo = defineEntity({
  type: "memo",
  purpose: "A memo.",
  metadata: z.object({ title: z.string() }),
});

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-folder-titles"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "books", entities }),
    {},
    { name: "@fixture/books", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  return harness;
}

const record = {
  id: "book:part:1",
  content: "Text.",
  metadata: { title: "One", headings: ["Part", "Chapter"] },
};

describe("a first-party entity type's folder titles", () => {
  it("are what the definition reads from the record", async () => {
    const harness = await install([section, memo]);
    try {
      const registry = harness.getEntityRegistry();
      expect(registry.getAdapter("section").getFolderTitles?.(record)).toEqual([
        undefined,
        "Part",
        "Chapter",
      ]);
      expect(registry.getAdapter("memo").getFolderTitles).toBeUndefined();
    } finally {
      await harness.reset();
    }
  });

  it("are none for a record whose metadata the type does not read", async () => {
    const harness = await install([section]);
    try {
      expect(
        harness
          .getEntityRegistry()
          .getAdapter("section")
          .getFolderTitles?.({ content: "Text." }),
      ).toEqual([]);
    } finally {
      await harness.reset();
    }
  });

  it("leave the definition otherwise as it was", () => {
    expect(section.type).toBe("section");
    expect(Object.isFrozen(section)).toBe(true);
  });
});
