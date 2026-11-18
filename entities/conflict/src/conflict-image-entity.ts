import { CONFLICT_IMAGE_ENTITY_TYPE } from "@brains/contracts";
import {
  defineEntity,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { conflictImageFieldsSchema } from "./schemas";

/**
 * An image saved over a newer one: kept as its bytes, so it is not lost.
 * Bytes live in an asset, which only an entity that is nothing but its
 * asset can hold, so a losing image is its own type beside `conflict`. It
 * is listed, applied and dismissed with the text conflicts, and like them
 * is written only by the brain and kept out of search and projections.
 */
export const conflictImage: EntityDefinition<
  typeof CONFLICT_IMAGE_ENTITY_TYPE,
  typeof conflictImageFieldsSchema
> = defineEntity({
  type: CONFLICT_IMAGE_ENTITY_TYPE,
  classification: "system",
  purpose:
    "An image saved over a newer version of an image, kept until an admin applies or dismisses it in the Inbox.",
  metadata: conflictImageFieldsSchema,
  config: {
    actionPolicy: {
      create: "never",
      update: "never",
      delete: "never",
      extract: "never",
      publish: "never",
    },
    binaryStorage: "asset",
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
});

export type ConflictImage = EntityOf<typeof conflictImage>;
