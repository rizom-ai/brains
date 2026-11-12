import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  withFrontmatterSchema,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import { topicAtproto } from "./atproto-projection";
import { withoutLegacySources } from "./lib/topic-document";
import { topicFrontmatterSchema } from "./schemas/topic";

/** A topic indexes nothing: its title and text are its document. */
const topicMetadata: z.ZodObject<Record<string, never>> = z.object({});

const storedTopic = storedDocumentCodec<
  typeof topicFrontmatterSchema,
  typeof topicMetadata
>({
  header: topicFrontmatterSchema,
  deriveMetadata: () => ({}),
  readAsWritten: true,
});
// A read is the stored document as written. A write drops the Sources
// section old topics kept, and states a header that names no title under
// "Unknown Topic", as the topics class wrote every topic. The codec stays
// the one storedDocumentCodec made, which is what reads as written.
const storedDecode = storedTopic.decode;
Object.assign(storedTopic, {
  decode: (document: Parameters<typeof storedDecode>[0]) => {
    const { visibility: _visibility, ...header } = document.frontmatter;
    return topicFrontmatterSchema.safeParse(header).success
      ? storedDecode({
          ...document,
          content: withoutLegacySources(document.content),
        })
      : storedDecode({
          content: document.content,
          frontmatter: { ...document.frontmatter, title: "Unknown Topic" },
        });
  },
});

/**
 * A topic: a recurring theme derived from the brain's content. Read as its
 * stored document, as the topics class read it: its title is the header
 * every title reader takes, and metadata indexes nothing, as the class
 * indexed nothing, so a topic stored before the conversion reads at once.
 * A write keeps the header as the document states it, in its order, and
 * drops the legacy Sources section old topics kept, as the class did.
 */
export const topic: EntityDefinition<"topic", typeof topicMetadata> =
  writesInDocumentOrder(
    withFrontmatterSchema(
      defineEntity({
        type: "topic",
        purpose:
          "A recurring theme or subject derived from the user's content.",
        classification: "content",
        metadata: topicMetadata,
        markdown: storedTopic,
        config: {
          weight: 0.5,
          projectionSource: false,
          projectionSourceRole: "excluded",
        },
        atproto: topicAtproto,
      }),
      topicFrontmatterSchema,
    ),
  );
