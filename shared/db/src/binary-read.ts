import { z } from "@brains/utils/zod";
import {
  binaryUploadEndpointSchema,
  type BinaryRequestContext,
} from "./binary-publication";
import {
  blobFactsSchema,
  blobPlanSchema,
  type BlobFacts,
} from "./turso-worker/blob-protocol";

export const binaryReadEndpointSchema: z.ZodObject<
  typeof binaryUploadEndpointSchema.shape & { direction: z.ZodLiteral<"read"> }
> = binaryUploadEndpointSchema.extend({ direction: z.literal("read") });
export const binaryReadOfferSchema: z.ZodObject<
  typeof blobFactsSchema.shape & { ticket: z.ZodString }
> = blobFactsSchema.extend({ ticket: z.string().uuid() });
/** Owner-local selection, never accepted from a remote read caller. */
export const binaryReadSelectionSchema: z.ZodObject<{
  plan: typeof blobPlanSchema;
  sha256: z.ZodString;
}> = z.strictObject({
  plan: blobPlanSchema,
  sha256: blobFactsSchema.shape.sha256,
});
export const binaryReadFactsSchema: typeof blobFactsSchema = blobFactsSchema;
export type BinaryReadSelection = z.output<typeof binaryReadSelectionSchema>;
export type BinaryReadOffer = z.output<typeof binaryReadOfferSchema>;
export type BinaryReadEndpoint = z.output<typeof binaryReadEndpointSchema>;
export interface BinaryReadPersistence {
  offer(
    context: BinaryRequestContext,
    selection: BinaryReadSelection,
  ): Promise<BinaryReadOffer>;
  download(context: BinaryRequestContext, ticket: string): Promise<BlobFacts>;
  endpoint(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<BinaryReadEndpoint>;
  /** Retire an idle or active socket-bound read; success acknowledges scope cleanup. */
  cancel(context: BinaryRequestContext, ticket: string): Promise<void>;
  close(): Promise<void>;
}
