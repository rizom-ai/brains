import { z } from "@brains/utils/zod";
import { networkEndpointSchema } from "./network-wire";
import { blobFactsSchema } from "./blob-protocol";
import { STAGE_CHUNK_BYTES, STAGE_BUDGET_BYTES } from "./binary-protocol";

export const readEndpointSchema: z.ZodObject<
  typeof networkEndpointSchema.shape & { direction: z.ZodLiteral<"read"> }
> = networkEndpointSchema.extend({ direction: z.literal("read") });
export const readOfferSchema: z.ZodObject<
  typeof blobFactsSchema.shape & { ticket: z.ZodString }
> = blobFactsSchema.extend({ ticket: z.string().uuid() });
export type ReadOffer = z.output<typeof readOfferSchema>;

// Deterministic consumer checkpoint, not a timer or a transport chunk-size change.
export const readPauseAfterSchema: z.ZodNumber = z
  .number()
  .int()
  .min(STAGE_CHUNK_BYTES)
  .max(STAGE_BUDGET_BYTES)
  .multipleOf(STAGE_CHUNK_BYTES);
export const readPausedSchema: z.ZodObject<
  typeof blobFactsSchema.shape & {
    kind: z.ZodLiteral<"chunk-held">;
    pid: z.ZodNumber;
  }
> = blobFactsSchema.extend({
  kind: z.literal("chunk-held"),
  pid: z.number().int().positive(),
});
