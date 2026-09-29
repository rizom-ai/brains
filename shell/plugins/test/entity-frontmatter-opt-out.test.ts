import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src/public/entity-definition";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import { createPluginHarness } from "../src/test/harness";
import { createOperatorGroupings } from "../src/service/operator-groupings";

const metadata = z.object({ title: z.string() });
const opaque = defineEntity({
  type: "opaque-fixture",
  purpose: "Non-Markdown representation",
  metadata,
  markdown: {
    frontmatter: false,
    decode: ({ content, frontmatter }) => {
      expect(frontmatter).toEqual({});
      return { content, metadata: { title: "Opaque" } };
    },
    encode: ({ content }) => ({ content, frontmatter: {} }),
  },
});
const inferred = defineEntity({
  type: "inferred-fixture",
  purpose: "Default representation",
  metadata,
});
const explicit = defineEntity({
  type: "explicit-fixture",
  purpose: "Different authored fields",
  metadata,
  markdown: {
    frontmatter: z.object({ name: z.string() }),
    decode: ({ content }) => ({ content, metadata: { title: "Explicit" } }),
    encode: ({ content }) => ({ content, frontmatter: { name: "Explicit" } }),
  },
});
const contradictory = defineEntity({
  type: "contradictory-fixture",
  purpose: "Contradictory representation",
  metadata,
  markdown: {
    frontmatter: false,
    decode: ({ content }) => ({ content, metadata: { title: "Opaque" } }),
    encode: ({ content }) => ({
      content,
      frontmatter: { title: "Not allowed" },
    }),
  },
});

test("frontmatter opt-out is representation-owned, preserves opaque bytes and does not erase metadata", async () => {
  const h = createPluginHarness({ logContext: "frontmatter-opt-out" });
  try {
    for (const plugin of createEntityPackagePlugins(
      [opaque, inferred, explicit, contradictory],
      [],
      { name: "@fixture/representations", version: "1.0.0" },
      (id) => id,
    ))
      await h.installPlugin(plugin);
    const registry = h.getEntityRegistry();
    const adapter = registry.getAdapter(opaque.type);
    const content = "---\nmalformed: [\n---\n  opaque bytes\n\n";
    expect(adapter.frontmatterSchema).toBeUndefined();
    expect(registry.getEffectiveFrontmatterSchema(opaque.type)).toBeUndefined();
    expect(adapter.fromMarkdown(content)).toEqual({
      content,
      metadata: { title: "Opaque" },
    });
    const record = {
      id: "one",
      entityType: opaque.type,
      content,
      metadata: { title: "Opaque" },
      visibility: "public" as const,
      contentHash: "hash",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    };
    expect(adapter.toMarkdown(record)).toBe(content);
    expect(adapter.extractMetadata(record)).toEqual({ title: "Opaque" });
    const groups = createOperatorGroupings(h.getMockShell());
    expect(groups.canContribute(opaque.type)).toBe(false);
    expect(groups.canContribute(inferred.type)).toBe(true);
    expect(() =>
      registry.registerGrouping({
        key: "areas",
        field: "areas",
        label: "Areas",
        types: [opaque.type],
      }),
    ).toThrow("eligible content entity type");
    expect(
      Object.keys(
        registry.getEffectiveFrontmatterSchema(inferred.type)?.shape ?? {},
      ),
    ).toEqual(["title"]);
    expect(
      Object.keys(
        registry.getEffectiveFrontmatterSchema(explicit.type)?.shape ?? {},
      ),
    ).toEqual(["name"]);
    expect(() =>
      registry.getAdapter(inferred.type).fromMarkdown(content),
    ).toThrow();
    expect(() =>
      registry
        .getAdapter(contradictory.type)
        .toMarkdown({ ...record, entityType: contradictory.type }),
    ).toThrow("cannot emit domain frontmatter");
  } finally {
    await h.reset();
  }
});
