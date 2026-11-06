import { defineEntity, z, type EntityDefinition } from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
// Metadata written inline in a definition keeps its literal types without an
// annotation, whether or not the callback that returns it takes parameters.
const draftMetadata = z.object({
  status: z.enum(["draft", "generating", "ready"]),
  tags: z.array(z.string()).default([]),
});

export const draft = defineEntity({
  type: "draft",
  purpose: "A draft written from a topic.",
  metadata: draftMetadata,
  markdown: {
    decode: ({ content }) => ({ content, metadata: { status: "draft" } }),
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: { status: metadata.status },
    }),
  },
  seed: {
    on: "startup-content-settled",
    id: "first-draft",
    content: () => "",
    metadata: { status: "draft", tags: ["welcome"] },
  },
  stub: () => ({ content: "", metadata: { status: "generating" } }),
  generation: {
    input: z.object({ topic: z.string() }),
    generate: async ({ input }) => ({
      success: true,
      content: input.topic,
      metadata: { status: "ready", tags: [input.topic] },
    }),
  },
  create: {
    fromPrompt: {
      resolve: async () => ({
        create: { id: "draft", content: "", metadata: { status: "draft" } },
      }),
    },
    fromContent: {
      resolve: async ({ input }) =>
        input.content
          ? {
              create: {
                id: input.title ?? "draft",
                content: input.content,
                metadata: { status: "ready", tags: ["pasted"] },
              },
            }
          : { refuse: "A draft needs text" },
    },
  },
});

// Inference is unchanged: the type and schema come through as declared.
export const typedDraft: EntityDefinition<"draft", typeof draftMetadata> =
  draft;

export const titledDraft = defineEntity({
  type: "titled-draft",
  purpose: "A draft that starts from its title.",
  metadata: draftMetadata,
  stub: ({ title }) => ({
    content: title,
    metadata: { status: "generating", tags: [title] },
  }),
  generation: {
    input: z.object({}),
    generate: async () => ({
      success: true,
      content: "",
      metadata: { status: "ready" },
    }),
  },
});

export const invalidInlineStub = defineEntity({
  type: "invalid-inline-stub",
  purpose: "Compile-only rejection",
  metadata: draftMetadata,
  // @ts-expect-error An inline literal is still one the schema must accept.
  stub: () => ({ content: "", metadata: { status: "published" } }),
});

export const invalidInlineSeed = defineEntity({
  type: "invalid-inline-seed",
  purpose: "Compile-only rejection",
  metadata: draftMetadata,
  seed: {
    on: "startup-content-settled",
    id: "invalid-inline-seed",
    content: () => "",
    // @ts-expect-error An inline literal is still one the schema must accept.
    metadata: { status: "published" },
  },
});

export const invalidInlineGeneration = defineEntity({
  type: "invalid-inline-generation",
  purpose: "Compile-only rejection",
  metadata: draftMetadata,
  generation: {
    input: z.object({ topic: z.string() }),
    // @ts-expect-error An inline literal is still one the schema must accept.
    generate: async () => ({
      success: true,
      content: "",
      metadata: { status: "published" },
    }),
  },
});

export const invalidInlineRoute = defineEntity({
  type: "invalid-inline-route",
  purpose: "Compile-only rejection",
  metadata: draftMetadata,
  create: {
    fromPrompt: {
      // @ts-expect-error An inline literal is still one the schema must accept.
      resolve: async () => ({
        create: { id: "x", content: "", metadata: { status: "published" } },
      }),
    },
  },
});
