import {
  defineEntity,
  defineEntityPackage,
  defineProjection,
  z,
  type EncodedEntityMarkdown,
  type EntityMarkdownCodec,
  type EntityMarkdownDocument,
  type EntityPackageDefinition,
  type EntityTypeClassification,
  type ProjectionDefinition,
} from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const quoteMetadata = z.object({ author: z.string() });

// A codec written on its own, typed by the schema it reads and writes.
const quoteMarkdown: EntityMarkdownCodec<typeof quoteMetadata> = {
  decode: ({ content, frontmatter }) => {
    const document: EntityMarkdownDocument<{ author: string }> = {
      content,
      metadata: { author: String(frontmatter["author"] ?? "unknown") },
    };
    return document;
  },
  encode: ({ content, metadata }) => {
    const encoded: EncodedEntityMarkdown = {
      content,
      frontmatter: { author: metadata.author },
    };
    return encoded;
  },
};

const classification: EntityTypeClassification = "content";

export const quote = defineEntity({
  type: "quote",
  purpose: "A line worth keeping, with who said it.",
  classification,
  metadata: quoteMetadata,
  markdown: quoteMarkdown,
});

export const attribution = defineEntity({
  type: "attribution",
  purpose: "Who a quote is by.",
  metadata: z.object({ quoteId: z.string() }),
});

const attributeQuote: ProjectionDefinition<typeof quote, typeof attribution> =
  defineProjection({
    id: "attribute-quote",
    source: quote,
    target: attribution,
    async project({ source, target }) {
      await target.upsert({
        id: source.id,
        content: source.metadata.author,
        metadata: { quoteId: source.id },
      });
    },
  });

export const codecTypeCanary: EntityPackageDefinition = defineEntityPackage({
  id: "quotes",
  entities: [quote, attribution],
  projections: [attributeQuote],
});

// @ts-expect-error A type is classified as content or system.
const unknownClassification: EntityTypeClassification = "archive";
void unknownClassification;
