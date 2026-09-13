import { z } from "@brains/utils/zod";
import { STAGE_BUDGET_BYTES } from "./binary-protocol";
import { VERIFY_SCRATCH_BYTES } from "./blob-protocol";
import type { WorkerCommand } from "./protocol";

export const budgetGrantSchema: z.ZodObject<{
  pool: z.ZodString;
  id: z.ZodNumber;
  kind: z.ZodEnum<{ resident: "resident"; scratch: "scratch" }>;
  bytes: z.ZodNumber;
}> = z.strictObject({
  pool: z.string().uuid(),
  id: z.number().int().positive(),
  kind: z.enum(["resident", "scratch"]),
  bytes: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
});
export type BudgetGrant = z.output<typeof budgetGrantSchema>;
export type BudgetKind = BudgetGrant["kind"];
export type BudgetRequirement = Pick<BudgetGrant, "kind" | "bytes">;
export function budgetRequirement(
  command: WorkerCommand,
): BudgetRequirement | undefined {
  if (command.op === "binary" && command.command.action === "beginStage")
    return { kind: "resident", bytes: command.command.reservationBytes };
  if (command.op === "read") {
    if (command.command.action === "allocate")
      return { kind: "resident", bytes: command.command.plan.maxBytes };
    if (command.command.action === "fill")
      return { kind: "scratch", bytes: VERIFY_SCRATCH_BYTES };
  }
  if (command.op === "verifyBlob")
    return { kind: "scratch", bytes: VERIFY_SCRATCH_BYTES };
  return undefined;
}
export function validateBudgetGrant(
  command: WorkerCommand,
  input: BudgetGrant | undefined,
  pool: string,
  id: number,
): void {
  const required = budgetRequirement(command);
  if (!required) {
    if (input !== undefined)
      throw new Error("Unexpected persistence budget grant");
    return;
  }
  const grant = budgetGrantSchema.parse(input);
  if (
    grant.pool !== pool ||
    grant.id !== id ||
    grant.kind !== required.kind ||
    grant.bytes !== required.bytes
  )
    throw new Error("Foreign or mismatched persistence budget grant");
}
