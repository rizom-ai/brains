import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withFrontmatterSchema,
  writesInDocumentOrder,
  type AnyEntityDefinition,
} from "../src";

/**
 * A first-party declared type whose file header is not its metadata states
 * the header as its frontmatter schema, as its entity plugin class's
 * adapter did: what Studio's editor, the Obsidian vault's templates and
 * frontmatter extensions read as the type's frontmatter. A type that does
 * not state one keeps its metadata as its frontmatter.
 */

const header = z.object({
  title: z.string(),
  status: z.enum(["new", "done"]).meta({ studioWidget: "provenance" }),
  source: z.object({ ref: z.string() }),
});
const metadata = z.object({ title: z.string(), indexedAt: z.string() });

function ticket(type: string): AnyEntityDefinition {
  return defineEntity({
    type,
    purpose: "A record whose file header is not its metadata.",
    metadata,
  });
}

async function frontmatterOf(
  definition: AnyEntityDefinition,
): Promise<z.ZodObject | undefined> {
  const harness = createPluginHarness();
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "tickets", entities: [definition] }),
    {},
    { name: "@fixture/tickets", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  return harness
    .getEntityRegistry()
    .getEffectiveFrontmatterSchema(definition.type);
}

describe("a declared type's frontmatter schema", () => {
  it("is the header it states, as its class's adapter declared", async () => {
    const schema = await frontmatterOf(
      withFrontmatterSchema(ticket("ticket"), header),
    );
    expect(Object.keys(schema?.shape ?? {})).toEqual([
      "title",
      "status",
      "source",
    ]);
    expect(schema?.shape["status"]?.meta()).toEqual({
      studioWidget: "provenance",
    });
  });

  it("composes with writing in document order, either way round", async () => {
    for (const definition of [
      writesInDocumentOrder(withFrontmatterSchema(ticket("ticket"), header)),
      withFrontmatterSchema(writesInDocumentOrder(ticket("ticket")), header),
    ]) {
      expect(
        Object.keys((await frontmatterOf(definition))?.shape ?? {}),
      ).toEqual(["title", "status", "source"]);
    }
  });

  it("is its metadata when it states none", async () => {
    expect(
      Object.keys((await frontmatterOf(ticket("plain")))?.shape ?? {}),
    ).toEqual(["title", "indexedAt"]);
  });

  it("still writes every field its metadata names, though it presents only its header", async () => {
    const harness = createPluginHarness();
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({
        id: "tickets",
        entities: [withFrontmatterSchema(ticket("ticket"), header)],
      }),
      {},
      { name: "@fixture/tickets", version: "0.1.0" },
    )) {
      await harness.installPlugin(plugin);
    }
    const adapter = harness.getEntityRegistry().getAdapter("ticket");
    expect(Object.keys(adapter.writtenFrontmatterSchema?.shape ?? {})).toEqual([
      "title",
      "indexedAt",
      "status",
      "source",
    ]);
  });
});
