import { z } from "@brains/utils/zod";

export const rowValueSchema: z.ZodUnion<
  [z.ZodNull, z.ZodString, z.ZodNumber, z.ZodBigInt, z.ZodCustom<ArrayBuffer>]
> = z.union([
  z.null(),
  z.string(),
  z.number(),
  z.bigint(),
  z.instanceof(ArrayBuffer),
]);
export const resultSchema: z.ZodObject<{
  columns: z.ZodArray<z.ZodString>;
  columnTypes: z.ZodArray<z.ZodString>;
  rows: z.ZodArray<z.ZodArray<typeof rowValueSchema>>;
  rowsAffected: z.ZodNumber;
  lastInsertRowid: z.ZodOptional<z.ZodBigInt>;
}> = z.strictObject({
  columns: z.array(z.string()),
  columnTypes: z.array(z.string()),
  rows: z.array(z.array(rowValueSchema)),
  rowsAffected: z.number().int().nonnegative(),
  lastInsertRowid: z.bigint().optional(),
});
export type SqlResult = z.output<typeof resultSchema>;
export type SqlRowValue = z.output<typeof rowValueSchema>;
// Shape checks, not a substitute for sender-side byte admission/owned transfers.
export function parseResult(input: unknown): SqlResult {
  return resultSchema.parse(input);
}
export function parseResults(
  input: unknown,
  maximum: number = 16,
): SqlResult[] {
  return z.array(resultSchema).max(maximum).parse(input);
}
