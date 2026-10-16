import { z } from "@brains/utils/zod";

/** Message metadata key the host writes on a completed assistant reply. */
export const ASSISTANT_TURN_METADATA_KEY = "assistantTurn";

type RetrievedEntitySchema = z.ZodObject<
  { entityType: z.ZodString; entityId: z.ZodString },
  z.core.$strict
>;

const retrievedEntitySchema: RetrievedEntitySchema = z.strictObject({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

/**
 * Host-written facts about a completed assistant turn: when it started and
 * which entities its tools actually read. Never model- or user-supplied, and
 * absent on replies that await confirmation or answer a guest.
 */
export const assistantTurnSchema: z.ZodObject<
  {
    startedAt: z.ZodString;
    retrieved: z.ZodArray<RetrievedEntitySchema>;
  },
  z.core.$strict
> = z.strictObject({
  startedAt: z.string().datetime(),
  retrieved: z.array(retrievedEntitySchema).max(50),
});

export type AssistantTurn = z.output<typeof assistantTurnSchema>;
