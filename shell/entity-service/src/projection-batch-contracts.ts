import { z } from "@brains/utils/zod";

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

const bulkMutationInputSchema: Strict<{
  source: z.ZodString;
  operationId: z.ZodString;
}> = z.strictObject({
  source: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).max(200),
});

export type BulkMutationInput = z.output<typeof bulkMutationInputSchema>;

const durableBulkMutationRootSchema: Strict<{
  source: z.ZodString;
  operationId: z.ZodString;
  rootJobId: z.ZodString;
  expectedChildren: z.ZodNumber;
}> = z.strictObject({
  source: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).max(200),
  rootJobId: z.string().trim().min(1).max(200),
  expectedChildren: z.number().int().positive().max(10_000),
});

export type DurableBulkMutationRootInput = z.output<
  typeof durableBulkMutationRootSchema
>;

const durableBulkMutationChildSchema: Strict<{
  source: z.ZodString;
  operationId: z.ZodString;
  rootJobId: z.ZodString;
  expectedChildren: z.ZodNumber;
  childKey: z.ZodString;
  jobId: z.ZodString;
}> = z.strictObject({
  source: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).max(200),
  rootJobId: z.string().trim().min(1).max(200),
  expectedChildren: z.number().int().positive().max(10_000),
  childKey: z.string().trim().min(1).max(200),
  jobId: z.string().trim().min(1).max(200),
});

export type DurableBulkMutationChildInput = z.output<
  typeof durableBulkMutationChildSchema
>;

const settleDurableBulkMutationChildSchema: Strict<{
  operationId: z.ZodString;
  childKey: z.ZodString;
  jobId: z.ZodString;
  outcome: z.ZodEnum<{ completed: "completed"; failed: "failed" }>;
}> = z.strictObject({
  operationId: z.string().trim().min(1).max(200),
  childKey: z.string().trim().min(1).max(200),
  jobId: z.string().trim().min(1).max(200),
  outcome: z.enum(["completed", "failed"]),
});

export type SettleDurableBulkMutationChildInput = z.output<
  typeof settleDurableBulkMutationChildSchema
>;

export function parseBulkMutationInput(input: unknown): BulkMutationInput {
  return bulkMutationInputSchema.parse(input);
}

export function parseDurableBulkMutationRootInput(
  input: unknown,
): DurableBulkMutationRootInput {
  return durableBulkMutationRootSchema.parse(input);
}

export function parseDurableBulkMutationChildInput(
  input: unknown,
): DurableBulkMutationChildInput {
  return durableBulkMutationChildSchema.parse(input);
}

export function parseSettleDurableBulkMutationChildInput(
  input: unknown,
): SettleDurableBulkMutationChildInput {
  return settleDurableBulkMutationChildSchema.parse(input);
}

export interface ProjectionBatchOwnedJob {
  jobId: string;
  childKey: string;
  status: "pending" | "processing" | "completed" | "failed";
  terminalAt: number | null;
}

export type ProjectionBatchRootReader = (
  rootJobId: string,
  operationId: string,
) => Promise<readonly ProjectionBatchOwnedJob[]>;

export interface ProjectionBatchRecoveryResult {
  fencedCallbacks: number;
  releasedDurableRoots: number;
}
