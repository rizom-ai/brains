import { z } from "@brains/utils/zod";

export interface BulkMutationInput {
  source: string;
  operationId: string;
}

export interface DurableBulkMutationRootInput extends BulkMutationInput {
  rootJobId: string;
  expectedChildren: number;
}

export interface DurableBulkMutationChildInput extends DurableBulkMutationRootInput {
  childKey: string;
  jobId: string;
}

export interface SettleDurableBulkMutationChildInput {
  operationId: string;
  childKey: string;
  jobId: string;
  outcome: "completed" | "failed";
}

const bulkMutationInputSchema: z.ZodType<BulkMutationInput, unknown> =
  z.strictObject({
    source: z.string().trim().min(1).max(100),
    operationId: z.string().trim().min(1).max(200),
  });

const durableBulkMutationRootSchema: z.ZodType<
  DurableBulkMutationRootInput,
  unknown
> = z.strictObject({
  source: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).max(200),
  rootJobId: z.string().trim().min(1).max(200),
  expectedChildren: z.number().int().positive().max(10_000),
});

const durableBulkMutationChildSchema: z.ZodType<
  DurableBulkMutationChildInput,
  unknown
> = z.strictObject({
  source: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).max(200),
  rootJobId: z.string().trim().min(1).max(200),
  expectedChildren: z.number().int().positive().max(10_000),
  childKey: z.string().trim().min(1).max(200),
  jobId: z.string().trim().min(1).max(200),
});

const settleDurableBulkMutationChildSchema: z.ZodType<
  SettleDurableBulkMutationChildInput,
  unknown
> = z.strictObject({
  operationId: z.string().trim().min(1).max(200),
  childKey: z.string().trim().min(1).max(200),
  jobId: z.string().trim().min(1).max(200),
  outcome: z.enum(["completed", "failed"]),
});

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
