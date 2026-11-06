import {
  defineEntity,
  z,
  type AtprotoBlobRef,
  type AtprotoLexicon,
  type EntityAtprotoProjection,
  type EntityAtprotoPublishConfig,
  type EntityAtprotoRecordInput,
  type EntityDefinition,
  type EntityOf,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const highlightLexicon: AtprotoLexicon = {
  lexicon: 1,
  id: "example.reader.highlight",
  defs: {
    main: {
      type: "record",
      key: "any",
      record: {
        type: "object",
        required: ["quote", "createdAt"],
        properties: {
          quote: { type: "string" },
          source: { type: "string", format: "uri" },
          card: { type: "blob", accept: ["image/png"] },
          createdAt: { type: "string", format: "datetime" },
        },
      },
    },
  },
};

const highlightMetadata = z.object({
  quote: z.string(),
  bookmarkId: z.string(),
  status: z.enum(["draft", "shared"]).default("draft"),
});

type Highlight = EntityOf<
  EntityDefinition<"highlight", typeof highlightMetadata>
>;

function signedBy(config: EntityAtprotoPublishConfig): {
  readonly brainDid?: string;
} {
  return config.brainDid ? { brainDid: config.brainDid } : {};
}

async function shareCard(
  input: EntityAtprotoRecordInput<Highlight>,
): Promise<AtprotoBlobRef> {
  return input.uploadBlob({
    data: new TextEncoder().encode(input.entity.metadata.quote),
    mimeType: "image/png",
  });
}

const highlightProjection: EntityAtprotoProjection<Highlight> = {
  lexicon: highlightLexicon,
  validate: true,
  isPublishable: (highlight) => highlight.metadata.status === "shared",
  buildRecord: async (input) => {
    const saved = await input.entities.get(
      bookmark,
      input.entity.metadata.bookmarkId,
    );
    return {
      $type: highlightLexicon.id,
      quote: input.entity.metadata.quote,
      ...(saved?.visibility === "public" && { source: saved.metadata.url }),
      ...(input.dryRun ? {} : { card: await shareCard(input) }),
      ...signedBy(input.config),
      ...(input.pageUrl && { canonicalUrl: input.pageUrl }),
      createdAt: input.entity.created,
    };
  },
};

export const highlight = defineEntity({
  type: "highlight",
  purpose: "A passage the reader shares from a saved page.",
  metadata: highlightMetadata,
  atproto: highlightProjection,
});

// Declared inline, the record input is the type's own validated entity.
export const sharedNote = defineEntity({
  type: "shared-note",
  purpose: "A short note the reader shares.",
  metadata: z.object({ body: z.string(), topics: z.array(z.string()) }),
  atproto: {
    lexicon: { ...highlightLexicon, id: "example.reader.note" },
    buildRecord: async ({ entity, topics }) => ({
      $type: "example.reader.note",
      body: entity.metadata.body,
      topics: [...entity.metadata.topics, ...(topics ?? [])],
      createdAt: entity.created,
    }),
  },
});

export const invalidPublishable = defineEntity({
  type: "invalid-publishable",
  purpose: "Compile-only rejection",
  metadata: highlightMetadata,
  atproto: {
    lexicon: highlightLexicon,
    // @ts-expect-error Publishability reads the type's own metadata.
    isPublishable: (entity) => entity.metadata.published === true,
    buildRecord: async () => ({}),
  },
});

export const invalidRecord = defineEntity({
  type: "invalid-record",
  purpose: "Compile-only rejection",
  metadata: highlightMetadata,
  atproto: {
    lexicon: highlightLexicon,
    // @ts-expect-error A record is an object, not a string.
    buildRecord: async ({ entity }) => entity.metadata.quote,
  },
});

export const invalidLexicon: AtprotoLexicon = {
  lexicon: 1,
  id: "example.reader.broken",
  // @ts-expect-error A lexicon's main definition is its record.
  defs: { main: { type: "object", properties: {} } },
};

export async function invalidBlob(
  input: EntityAtprotoRecordInput<Highlight>,
): Promise<AtprotoBlobRef> {
  // @ts-expect-error A blob is bytes, not text.
  return input.uploadBlob({ data: "quote", mimeType: "text/plain" });
}
