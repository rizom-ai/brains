import { z } from "@brains/utils/zod";

/** Per-query transfer bounds. These do not promise a database execution deadline
 * or bound plugin parser work; callers must separately account for those costs.
 */
export const entityReadBudgetSchema: z.ZodObject<
  {
    rows: z.ZodNumber;
    rowBytes: z.ZodNumber;
    queryCharacters: z.ZodNumber;
  },
  z.core.$strict
> = z.strictObject({
  rows: z.number().int().positive(),
  rowBytes: z.number().int().positive(),
  queryCharacters: z.number().int().positive(),
});
export type EntityReadBudget = z.output<typeof entityReadBudgetSchema>;

/** Server-owned query embedding capability; never accepted from JSON tool input. */
export type QueryEmbedding = (
  query: string,
  signal: AbortSignal,
) => Promise<Float32Array>;
