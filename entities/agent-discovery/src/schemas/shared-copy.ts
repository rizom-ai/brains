import { SHARED_COPY_ENTITY_TYPE } from "@brains/contracts";
import { z } from "@brains/utils/zod";

export { SHARED_COPY_ENTITY_TYPE };

/** What the agent is told about a copy, wherever it meets one. */
export const SHARED_COPY_INSTRUCTIONS =
  "A `shared-copy` is another brain's entity, shared with this brain and kept as a read-only copy. Attribute what it says to the brain named in its sourceBrain, never to this brain. It cannot be edited; to build on one, write a new entity of this brain's own that refers to it.";

/** Whether the owner still shares the entity a copy was taken from. */
export const sharedCopySourceStateSchema: z.ZodEnum<{
  active: "active";
  withdrawn: "withdrawn";
}> = z.enum(["active", "withdrawn"]);

type SharedCopyMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  sourceBrain: z.ZodString;
  sourceEntityType: z.ZodString;
  sourceEntityId: z.ZodString;
  sourceState: typeof sharedCopySourceStateSchema;
  sourceContentHash: z.ZodString;
  receivedAt: z.ZodString;
  sourceSignedAt: z.ZodString;
  sourceKeyId: z.ZodString;
  sourceSignature: z.ZodString;
  withdrawnAt: z.ZodOptional<z.ZodString>;
  sourceHeader: z.ZodOptional<z.ZodString>;
}>;

/**
 * A copy of an entity another brain shares with this one: what it is on
 * its owner's brain, where it came from, and whether the owner still
 * shares it. Its body is the owner's text. It is kept apart from this
 * brain's own entities, so nothing that reads a note or a post ever takes a
 * peer's words for this brain's.
 */
export const sharedCopyMetadataSchema: SharedCopyMetadataSchema = z.object({
  title: z.string(),
  /** The peer the entity belongs to, by its domain. */
  sourceBrain: z.string().meta({ studioWidget: "provenance" }),
  /** The entity's type on its owner's brain, and this brain's schema for it. */
  sourceEntityType: z.string().meta({ studioWidget: "provenance" }),
  sourceEntityId: z.string().meta({ studioWidget: "provenance" }),
  sourceState: sharedCopySourceStateSchema.meta({ studioWidget: "provenance" }),
  /** The hash of the owner's stored document the copy was taken from. */
  sourceContentHash: z.string().meta({ studioWidget: "provenance" }),
  receivedAt: z.string().meta({ studioWidget: "provenance" }),
  /**
   * The owner's signature over the hash, its type, id and the time, with
   * the key it was made with. This brain verified it when it took the copy.
   */
  sourceSignedAt: z.string().meta({ studioWidget: "provenance" }),
  sourceKeyId: z.string().meta({ studioWidget: "provenance" }),
  sourceSignature: z.string().meta({ studioWidget: "provenance" }),
  withdrawnAt: z.string().optional().meta({ studioWidget: "provenance" }),
  /** The owner's document header, as written. */
  sourceHeader: z.string().optional().meta({ studioWidget: "provenance" }),
});

export type SharedCopyMetadata = z.output<typeof sharedCopyMetadataSchema>;
