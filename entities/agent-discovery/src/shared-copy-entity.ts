import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  SHARED_COPY_ENTITY_TYPE,
  SHARED_COPY_INSTRUCTIONS,
  sharedCopyMetadataSchema,
} from "./schemas/shared-copy";

/** Nobody writes a copy by hand: the brain takes, refreshes and drops it. */
const READ_ONLY = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
} as const;

/**
 * A read-only copy of an entity another brain shares with this one. It is
 * its own type, apart from this brain's own entities, and never leaves the
 * database: the owner's text stays out of the content repo and its history.
 */
export const sharedCopy: EntityDefinition<
  typeof SHARED_COPY_ENTITY_TYPE,
  typeof sharedCopyMetadataSchema
> = defineEntity({
  type: SHARED_COPY_ENTITY_TYPE,
  classification: "content",
  purpose:
    "A read-only copy of an entity another brain shares with this one, kept current while its owner shares it.",
  metadata: sharedCopyMetadataSchema,
  config: {
    contentRepo: false,
    actionPolicy: READ_ONLY,
    // A peer's words are read, never the source of what this brain derives.
    projectionSource: false,
    projectionSourceRole: "excluded",
  },
  instructions: SHARED_COPY_INSTRUCTIONS,
});
