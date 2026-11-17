import {
  defineDataSource,
  defineEntity,
  z,
  type DataSourceDefinition,
  type EntityBytes,
  type EntityDefinition,
} from "@rizom/brain/entities";

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

const photoMetadata = z.object({ title: z.string(), mediaType: z.string() });

// An asset-backed type: a record's content is the opaque reference to its
// stored bytes, never a URL, and the bytes are read through the record.
export const photo: EntityDefinition<"photo", typeof photoMetadata> =
  defineEntity({
    type: "photo",
    purpose: "A photo kept as its bytes.",
    metadata: photoMetadata,
    config: { binaryStorage: "asset", embeddable: false },
  });

export const photoBytes: DataSourceDefinition = defineDataSource({
  id: "photo-bytes",
  name: "Photo bytes",
  description: "A photo's stored reference and the bytes behind it",
  fetch: async (_query, entities) => {
    const record = await entities.get(photo, "cover");
    // Null when the photo is not visible to this reader or has no bytes yet.
    const read: EntityBytes | null = await entities.readBytes(photo, "cover");
    return {
      stored: record?.content.startsWith("asset://sha256/") ?? false,
      mediaType: read?.mediaType ?? null,
      sizeBytes: read?.sizeBytes ?? 0,
      firstByte: read?.bytes[0] ?? null,
    };
  },
});
