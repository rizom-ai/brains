import { CONFLICT_ENTITY_TYPE } from "@brains/contracts";
import {
  defineEntity,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { withFrontmatterSchema } from "@brains/sdk/internal/entity-runtime";
import { conflictFieldsSchema } from "./schemas";

/**
 * An edit made over a newer version of an entity: kept, so it is not lost,
 * and out of the way, so it is not mistaken for content. Its frontmatter
 * names the entity and the versions involved; its body is the losing file
 * exactly as it arrived.
 *
 * Only the brain writes one. Nobody edits it: whoever made the edit applies
 * or dismisses it from the editor, or an admin does from the Inbox, and it
 * stays out of search, embeddings and projections.
 */
export const conflict: EntityDefinition<
  typeof CONFLICT_ENTITY_TYPE,
  typeof conflictFieldsSchema
> = withFrontmatterSchema(
  defineEntity({
    type: CONFLICT_ENTITY_TYPE,
    classification: "system",
    purpose:
      "An edit made over a newer version of an entry, kept until it is applied or dismissed.",
    metadata: conflictFieldsSchema,
    markdown: {
      decode: ({ content, frontmatter }) => ({
        content,
        metadata: conflictFieldsSchema.parse(frontmatter),
      }),
      encode: ({ content, metadata }) => ({ content, frontmatter: metadata }),
    },
    config: {
      actionPolicy: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
      embeddable: false,
      fullTextSearchable: false,
      includeInBroadSearch: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
    validatePersist: ({ visibility }) => {
      if (visibility === "public") {
        throw new Error("A conflict is never public");
      }
    },
  }),
  conflictFieldsSchema,
);

export type Conflict = EntityOf<typeof conflict>;
