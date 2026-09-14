import { z } from "@brains/utils/zod";
import { blobFactsSchema } from "./blob-protocol";
import { STAGE_CHUNK_BYTES, STAGE_BUDGET_BYTES } from "./binary-protocol";

export {
  binaryReadEndpointSchema as readEndpointSchema,
  binaryReadOfferSchema as readOfferSchema,
} from "../binary-read";
export type { BinaryReadOffer as ReadOffer } from "../binary-read";

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
