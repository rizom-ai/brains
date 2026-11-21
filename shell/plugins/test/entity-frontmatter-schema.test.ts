import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withFrontmatterSchema,
  storedFormCodec,
  storedFormWrites,
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

  it("is its metadata when it states none", async () => {
    expect(
      Object.keys((await frontmatterOf(ticket("plain")))?.shape ?? {}),
    ).toEqual(["title", "indexedAt"]);
  });

  // A header field its metadata does not name (a stored document's
  // sender, its days) is the file's own, kept from the document written.
  it("writes the fields its metadata names, though it presents its header", async () => {
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
    ]);
  });

  // A type that reads two stored forms presents the header of the form
  // the release writes, and owns the keys of both: writing one form after
  // reading the other leaves none of the other's keys behind as a key the
  // type does not name.
  it("presents the header its release writes and owns both forms' keys", async () => {
    const old = z.object({
      title: z.string(),
      cta: z.object({ heading: z.string() }),
    });
    const next = z.object({ title: z.string(), ctaHeading: z.string() });
    const harness = createPluginHarness();
    const definition = defineEntity({
      type: "ticket",
      purpose: "A record that reads two stored forms.",
      metadata: old,
      markdown: storedFormCodec<typeof old>({
        decode: ({ content, frontmatter }) => ({
          content,
          metadata: old.parse(frontmatter),
        }),
        encode: {
          old: ({ content, metadata }) => ({ content, frontmatter: metadata }),
          new: ({ content, metadata }) => ({
            content,
            frontmatter: {
              title: metadata.title,
              ctaHeading: metadata.cta.heading,
            },
          }),
        },
        header: { old, new: next },
      }),
    });
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "tickets", entities: [definition] }),
      {},
      { name: "@fixture/tickets", version: "0.1.0" },
    )) {
      await harness.installPlugin(plugin);
    }
    const adapter = harness.getEntityRegistry().getAdapter("ticket");
    expect(Object.keys(adapter.frontmatterSchema?.shape ?? {})).toEqual(
      Object.keys((storedFormWrites === "new" ? next : old).shape),
    );
    expect(Object.keys(adapter.writtenFrontmatterSchema?.shape ?? {})).toEqual([
      "title",
      "cta",
      "ctaHeading",
    ]);
  });
});
