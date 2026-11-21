import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  storedFormCodec,
} from "@brains/sdk/internal/entity-runtime";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { quizResultAdapter } from "./adapter";
import {
  currentHeaderOf,
  inCurrentShape,
  inNextForm,
  quizResultNextHeaderSchema,
} from "./stored-form";
import {
  quizResultFrontmatterSchema,
  quizResultMetadataSchema,
  type QuizResultMetadata,
} from "./schema";

/** The header fields a result's metadata states over its document's. */
const STATED_FIELDS = ["quiz", "receivedAt", "status", "notification"] as const;

/**
 * The header a write states: the document's whole header in the current
 * shape, the fields its metadata states the record's, as the stored
 * document codec wrote it. A body handed in without its header (a field
 * write) states those fields alone, and the serializer keeps the rest.
 */
function writtenHeader(
  content: string,
  metadata: QuizResultMetadata,
): Record<string, unknown> {
  const stated = Object.fromEntries(
    STATED_FIELDS.map((key) => [key, metadata[key]]),
  );
  if (Object.keys(parseMarkdown(content).frontmatter).length === 0)
    return stated;
  return { ...currentHeaderOf(content), ...stated };
}

/** The header's indexed fields, from a document in either form. */
const stored = storedDocumentCodec({
  header: quizResultFrontmatterSchema,
  deriveMetadata: (header) => quizResultAdapter.metadataFor(header),
  prepare: inCurrentShape,
});

/**
 * One quiz taken, written by the quiz's form: restricted to the owner and
 * kept out of search, embeddings and projections.
 *
 * An exception to the declared-type pattern, made deliberately, as the
 * quiz-result entity class kept it: the file's header holds the taker's
 * name and email, their answers and their results, but metadata indexes
 * only the quiz, its title, when it was taken, its status, its alert's
 * state and whether the taker left an email; the name, email, answers and
 * results never enter metadata. A read hands back the whole document, as
 * the class's adapter read it, and the target parses it; a write keeps
 * the header once, in the document's order (storedDocumentCodec).
 */
export const quizResultEntity: EntityDefinition<
  "quiz-result",
  typeof quizResultMetadataSchema
> = defineEntity({
  type: "quiz-result",
  purpose:
    "A restricted record of one quiz taken on the brain's site: what was asked and answered, and the results shown. Never public knowledge or model input.",
  metadata: quizResultMetadataSchema,
  // Either stored form reads; the store's is written: the current, all
  // header, or the next, what was answered and shown in the body.
  markdown: storedFormCodec<typeof quizResultMetadataSchema>({
    decode: stored.decode,
    encode: {
      old: ({ content, metadata }) => ({
        content: "",
        frontmatter: writtenHeader(content, metadata),
      }),
      new: ({ content, metadata }) =>
        inNextForm(writtenHeader(content, metadata)),
    },
    header: {
      old: quizResultFrontmatterSchema,
      new: quizResultNextHeaderSchema,
    },
    // What was answered, brought back to the header, comes before the
    // visibility that closes it.
    places: [["results", "answers", "visibility"]],
  }),
  config: {
    embeddable: false,
    fullTextSearchable: false,
    projectionSource: false,
    projectionSourceRole: "excluded",
  },
  validatePersist: ({ content, visibility }) => {
    if (visibility !== "restricted")
      throw new Error("Quiz results must have restricted visibility");
    quizResultAdapter.parseContent(content);
  },
});
