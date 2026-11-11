import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  writesInDocumentOrder,
  withFrontmatterSchema,
} from "@brains/sdk/internal/entity-runtime";
import { quizResultAdapter } from "./adapter";
import {
  quizResultFrontmatterSchema,
  quizResultMetadataSchema,
} from "./schema";

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
 * the header once, in the document's order (storedDocumentCodec with
 * writesInDocumentOrder).
 */
export const quizResultEntity: EntityDefinition<
  "quiz-result",
  typeof quizResultMetadataSchema
> = withFrontmatterSchema(
  writesInDocumentOrder(
    defineEntity({
      type: "quiz-result",
      purpose:
        "A restricted record of one quiz taken on the brain's site: what was asked and answered, and the results shown. Never public knowledge or model input.",
      metadata: quizResultMetadataSchema,
      markdown: storedDocumentCodec({
        header: quizResultFrontmatterSchema,
        deriveMetadata: (header) => quizResultAdapter.metadataFor(header),
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
    }),
  ),
  quizResultFrontmatterSchema,
);
