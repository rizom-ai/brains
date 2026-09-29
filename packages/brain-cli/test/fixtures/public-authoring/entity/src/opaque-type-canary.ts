import { defineEntity, z } from "@rizom/brain/entities";

// Non-Markdown representation: metadata remains indexed, not inferred as authored frontmatter.
export const opaqueRepresentationCanary = defineEntity({
  type: "opaque-example",
  purpose: "An opaque file representation",
  metadata: z.object({ title: z.string() }),
  markdown: {
    frontmatter: false,
    decode: ({ content }) => ({ content, metadata: { title: "Opaque" } }),
    encode: ({ content }) => ({ content, frontmatter: {} }),
  },
});

export const invalidRepresentationCanary = defineEntity({
  type: "invalid-opaque-example",
  purpose: "Compile-only rejection",
  metadata: z.object({}),
  markdown: {
    // @ts-expect-error Only a field schema or explicit false is supported; true is not a format declaration.
    frontmatter: true,
    decode: ({ content }) => ({ content, metadata: {} }),
    encode: ({ content }) => ({ content, frontmatter: {} }),
  },
});
