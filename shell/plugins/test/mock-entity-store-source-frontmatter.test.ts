import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * The entity service double serializes as the real entity service does: a
 * declared type writes its own frontmatter, and the header the document
 * carries beyond it stays in the stored file, once, as the real serializer
 * keeps it. A double that dropped it would store less than a brain stores.
 */

const routed = defineEntity({
  type: "routed",
  purpose: "A record whose metadata indexes part of its header.",
  metadata: z.object({ title: z.string() }),
  markdown: {
    decode: ({ content, frontmatter }) => ({
      content,
      metadata: z.object({ title: z.string() }).parse({
        title: frontmatter["title"],
      }),
    }),
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: { title: metadata.title },
    }),
  },
});

describe("the entity service double", () => {
  it("keeps the header a document carries beyond its type's own, once", async () => {
    const harness = createPluginHarness();
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "routing", entities: [routed] }),
      {},
      { name: "@fixture/routing", version: "0.1.0" },
    )) {
      await harness.installPlugin(plugin);
    }
    const entities = harness.getEntityService();

    await entities.createEntity({
      entity: {
        id: "one",
        entityType: "routed",
        content: "---\ntitle: One\nsource:\n  ref: imap:1\n---\nBody\n",
        metadata: { title: "One" },
      },
    });

    const stored = await entities.getEntity({
      entityType: "routed",
      id: "one",
      source: true,
    });
    // Rewritten as YAML is written, its values quoted where YAML needs it.
    expect(stored?.content).toBe(
      "---\ntitle: One\nsource:\n  ref: 'imap:1'\n---\nBody\n",
    );
    expect(stored?.metadata).toEqual({ title: "One" });
  });
});
