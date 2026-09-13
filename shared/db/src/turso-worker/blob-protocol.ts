import { z } from "@brains/utils/zod";

export const VERIFY_CHUNK_BYTES: number = 32 * 1024;
// LIMIT 2 detects ambiguous results: reserve both possible returned chunks.
export const VERIFY_SCRATCH_BYTES: number = 2 * VERIFY_CHUNK_BYTES;
export const VERIFY_SLOTS: number = 2;
export const MAX_VERIFY_BYTES: number = 100 * 1024 * 1024;
const keyValueSchema: z.ZodUnion<
  [z.ZodNull, z.ZodString, z.ZodNumber, z.ZodBigInt]
> = z.union([
  z.null(),
  z.string().max(512),
  z.number(),
  z.bigint().min(-9223372036854775808n).max(9223372036854775807n),
]);
const keySchema: z.ZodObject<{
  column: z.ZodString;
  value: typeof keyValueSchema;
}> = z.strictObject({
  column: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^\0]+$/),
  value: keyValueSchema,
});
export const blobPlanSchema: z.ZodObject<{
  table: z.ZodString;
  column: z.ZodString;
  key: z.ZodArray<typeof keySchema>;
  maxBytes: z.ZodNumber;
  expectedSize: z.ZodOptional<z.ZodNumber>;
}> = z.strictObject({
  table: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^\0]+$/),
  column: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^\0]+$/),
  key: z.array(keySchema).min(1).max(8),
  maxBytes: z.number().int().min(0).max(MAX_VERIFY_BYTES),
  expectedSize: z.number().int().min(0).max(MAX_VERIFY_BYTES).optional(),
});
export const blobFactsSchema: z.ZodObject<{
  sizeBytes: z.ZodNumber;
  sha256: z.ZodString;
}> = z.strictObject({
  sizeBytes: z.number().int().min(0).max(MAX_VERIFY_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type BlobPlan = z.output<typeof blobPlanSchema>;
export type BlobFacts = z.output<typeof blobFactsSchema>;
export function blobPlanBytes(plan: BlobPlan): number {
  return (
    512 +
    Buffer.byteLength(plan.table) +
    Buffer.byteLength(plan.column) +
    plan.key.reduce(
      (sum, key) =>
        sum +
        Buffer.byteLength(key.column) +
        (typeof key.value === "string" ? Buffer.byteLength(key.value) : 16),
      0,
    )
  );
}
