import { z } from "@brains/utils/zod";
import {
  MAX_VERIFY_BYTES,
  type BlobFacts,
  type BlobPlan,
} from "./turso-worker/blob-protocol";

export const binaryUploadSizeSchema: z.ZodNumber = z
  .number()
  .int()
  .min(0)
  .max(MAX_VERIFY_BYTES);
export const binaryUploadTicketSchema: z.ZodString = z.string().uuid();
export const binaryUploadOfferSchema: z.ZodObject<{ ticket: z.ZodString }> =
  z.strictObject({ ticket: binaryUploadTicketSchema });
export const binaryUploadReceiptSchema: z.ZodObject<{
  ticket: z.ZodString;
  sizeBytes: z.ZodNumber;
  sha256: z.ZodString;
}> = binaryUploadOfferSchema.extend({
  sizeBytes: binaryUploadSizeSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const binaryUploadEndpointSchema: z.ZodObject<{
  host: z.ZodLiteral<"127.0.0.1">;
  port: z.ZodNumber;
  token: z.ZodString;
}> = z.strictObject({
  host: z.literal("127.0.0.1"),
  port: z.number().int().min(1).max(65535),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export type BinaryUploadOffer = z.output<typeof binaryUploadOfferSchema>;
export type BinaryUploadReceipt = z.output<typeof binaryUploadReceiptSchema>;
export type BinaryUploadEndpoint = z.output<typeof binaryUploadEndpointSchema>;
export interface BinaryRequestContext {
  readonly signal: AbortSignal;
  readonly connectionSignal: AbortSignal;
}
export interface BinaryBindingQuery {
  toSQL(): { sql: string; params: unknown[] };
}
/** Owner-issued, non-serializable binding. Transaction identities must be live
 * and belong to this database/lease; the opaque object is not a native handle.
 */
export interface BinaryPublication {
  readonly facts: Readonly<BlobFacts>;
  run<T>(operation: () => Promise<T>): Promise<T>;
  executeBound(
    transaction: object,
    query: BinaryBindingQuery,
    placeholder: string,
  ): Promise<void>;
  verifyBlob(transaction: object, plan: BlobPlan): Promise<BlobFacts>;
}
/** One database's binary authority. Admission is socket-bound and single-use.
 * No controller bytes, filenames, hashing or buffered RPC fallback belong here.
 * consume owns acknowledged cleanup even if its callback rejects before use.
 */
export interface BinaryPersistence {
  offer(
    context: BinaryRequestContext,
    size: number,
  ): Promise<BinaryUploadOffer>;
  upload(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<BinaryUploadReceipt>;
  endpoint(
    context: BinaryRequestContext,
    ticket: string,
  ): Promise<BinaryUploadEndpoint>;
  cancel(context: BinaryRequestContext, ticket: string): Promise<void>;
  consume<T>(
    context: BinaryRequestContext,
    ticket: string,
    operation: (publication: BinaryPublication) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}
