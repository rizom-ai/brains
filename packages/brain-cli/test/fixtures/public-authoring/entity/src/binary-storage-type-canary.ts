import { defineEntity, z, type EntityDefinition } from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.

const scanMetadata = z.object({
  title: z.string(),
  mediaType: z.string(),
  pages: z.number(),
});

// A type with binary storage keeps its content as it is: its codec reads
// only what the bytes say, and needs no encode.
export const scan: EntityDefinition<"scan", typeof scanMetadata> = defineEntity(
  {
    type: "scan",
    purpose: "A scanned page kept as its bytes.",
    metadata: scanMetadata,
    config: { binaryStorage: "data-url", embeddable: false },
    markdown: {
      decode: ({ content }) => ({
        content,
        metadata: {
          mediaType: content.slice(5, content.indexOf(";")),
        },
      }),
    },
  },
);
