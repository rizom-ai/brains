import { afterEach, describe, expect, test } from "bun:test";
import { fetchStyleGuide } from "@brains/contracts";
import styleGuidePackage, {
  createStyleGuideContent,
} from "@brains/style-guide";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared style guide on the brain's own entity store: what it seeds,
 * what it keeps of an imported guide, and how it reads a guide the class
 * wrote, whose fields lived in its content and whose metadata was empty.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    styleGuidePackage,
    "@brains/style-guide",
    "style-guide",
    { classification: "system", embeddable: false },
  );
  stores.push(opened);
  return opened;
}

describe("the declared style guide on the entity store", () => {
  test("seeds the default guide the class seeded, byte for byte", async () => {
    const { service, settleStartupContent, stored } = await store();

    await settleStartupContent();

    // The class wrote createStyleGuideContent({ name: "Default style guide" }).
    expect((await stored("style-guide", "style-guide"))?.content).toBe(
      generateMarkdown({ name: "Default style guide" }, ""),
    );
    expect(await fetchStyleGuide(service)).toEqual({
      name: "Default style guide",
      guidance: "",
    });
  });

  test("keeps an imported guide's extension fields through a body update", async () => {
    const { service, stored } = await store();
    await service.createEntityFromMarkdown({
      input: {
        entityType: "style-guide",
        id: "style-guide",
        markdown:
          "---\nname: Imported\nvoice:\n  summary: Precise\ncustomExamples:\n  - Keep this extension\n---\n\nLong-form guidance.",
      },
    });
    const read = await service.getEntity({
      entityType: "style-guide",
      id: "style-guide",
    });
    if (!read) throw new Error("Missing style guide");

    await service.updateEntity({
      entity: { ...read, content: "Revised guidance.\n" },
    });

    const after = parseMarkdown(
      (await stored("style-guide", "style-guide"))?.content ?? "",
    );
    expect(after.frontmatter).toEqual({
      name: "Imported",
      voice: { summary: "Precise" },
      customExamples: ["Keep this extension"],
    });
    expect(after.content.trim()).toBe("Revised guidance.");
  });

  test("reads a guide the class wrote once its metadata is reconciled", async () => {
    const { service, settleStartupContent, stored, rewrite } = await store();
    await settleStartupContent();
    // As the class stored a house guide: fields in content, empty metadata.
    const classWritten = createStyleGuideContent(
      { name: "House", voice: { summary: "Plain words" } },
      "Write plainly.",
    );
    await rewrite("style-guide", "style-guide", classWritten, "{}");

    expect(await fetchStyleGuide(service)).toEqual({
      name: "Default style guide",
      guidance: "",
    });
    expect(await service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 1,
    });

    expect(await fetchStyleGuide(service)).toEqual({
      name: "House",
      voice: { summary: "Plain words" },
      guidance: "Write plainly.",
    });
    expect((await stored("style-guide", "style-guide"))?.content).toBe(
      classWritten,
    );
  });
});
