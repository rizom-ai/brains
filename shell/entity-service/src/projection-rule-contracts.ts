import { z } from "@brains/utils/zod";
import { type ProjectionWriteIntent } from "./projection-contracts";
import type {
  ProjectionChangedTarget,
  ProjectionRuleMemo,
  ProjectionWaveRule,
} from "./schema/projection-state";

const memoKeySchema = z.strictObject({
  ruleId: z.string().trim().min(1),
  ruleVersion: z.string().trim().min(1),
  inputFingerprint: z.string().trim().min(1),
});

const waveRuleInputSchema = z.strictObject({
  ruleId: z.string().trim().min(1),
  targetType: z.string().trim().min(1),
  level: z.number().int().nonnegative(),
});

const changedTargetSchema = z.strictObject({
  entityType: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  operation: z.enum(["upsert", "delete"]),
  contentHash: z.string().min(1).optional(),
});

export interface GetProjectionRuleMemoInput {
  ruleId: string;
  ruleVersion: string;
  inputFingerprint: string;
}

export interface ProjectionWaveRuleInput {
  ruleId: string;
  targetType: string;
  level: number;
}

export interface ApplyProjectionRuleResultInput {
  waveId: string;
  ruleId: string;
  ruleVersion: string;
  inputFingerprint: string;
  writeIntents: readonly ProjectionWriteIntent[];
  completedAt: number;
}

export interface ProjectionRuleMemoValue extends Omit<
  ProjectionRuleMemo,
  "writeIntents"
> {
  writeIntents: ProjectionWriteIntent[];
}

export function parseRuleMemoKey(input: unknown): GetProjectionRuleMemoInput {
  return memoKeySchema.parse(input);
}

export function parseWaveRuleInputs(rules: unknown): ProjectionWaveRuleInput[] {
  return z.array(waveRuleInputSchema).min(1).parse(rules);
}

export function parseWaveRule(rule: ProjectionWaveRule): ProjectionWaveRule {
  const changedTargets: ProjectionChangedTarget[] = z
    .array(changedTargetSchema)
    .parse(rule.changedTargets);
  return { ...rule, changedTargets };
}
