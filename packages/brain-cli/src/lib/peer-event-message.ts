import { z } from "@brains/utils/zod";

/** One app role telling the other, through the supervisor, what it changed. */
export const peerEventMessageSchema: z.ZodObject<{
  type: z.ZodLiteral<"peer-event">;
  event: z.ZodObject<{ type: z.ZodString; payload: z.ZodUnknown }>;
}> = z.object({
  type: z.literal("peer-event"),
  event: z.object({ type: z.string(), payload: z.unknown() }),
});
