import type {
  ApplyProjectionRuleResultInput,
  GetProjectionRuleMemoInput,
  ProjectionRuleMemoValue,
  ProjectionWaveRule,
} from "@brains/entity-service";
import type { JobHandler } from "@brains/job-queue";
import type {
  ProjectionExecutionContext,
  ProjectionInputContext,
  ProjectionRule,
  ProjectionWaveInput,
} from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type { PROJECTION_RULE_JOB_TYPE } from "./projection-wave-scheduler";

export interface ProjectionRuleJobData {
  waveId: string;
  ruleId: string;
}

const projectionRuleJobDataSchema: z.ZodType<ProjectionRuleJobData> =
  z.strictObject({
    waveId: z.string().trim().min(1),
    ruleId: z.string().trim().min(1),
  });

export interface ProjectionRuleJobResult {
  waveId: string;
  ruleId: string;
  inputFingerprint: string;
  changedTargets: ProjectionWaveRule["changedTargets"];
}

interface PersistedProjectionWaveInput extends ProjectionWaveInput {
  waveId: string;
  generation: number;
}

export interface ProjectionRuleExecutionStore {
  listWaveInputs(waveId: string): Promise<PersistedProjectionWaveInput[]>;
  listWaveRules(waveId: string): Promise<ProjectionWaveRule[]>;
  getRuleMemo(
    input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null>;
  applyRuleResult(
    input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule>;
}

export interface ProjectionWaveCoordinator {
  advanceActiveWave(waveId: string): Promise<unknown>;
  failActiveWave(waveId: string): Promise<unknown>;
}

export interface ProjectionRuleJobHandlerOptions {
  rules: readonly ProjectionRule[];
  store: ProjectionRuleExecutionStore;
  coordinator: ProjectionWaveCoordinator;
  inputContext: ProjectionInputContext;
  executionContext: ProjectionExecutionContext;
  reconcileTargets: (
    targets: ProjectionWaveRule["changedTargets"],
  ) => Promise<void>;
  now: () => number;
}

/** Executes one scheduler-selected rule without exposing entity mutation APIs. */
export class ProjectionRuleJobHandler implements JobHandler<
  typeof PROJECTION_RULE_JOB_TYPE,
  ProjectionRuleJobData,
  ProjectionRuleJobResult
> {
  private readonly ruleById: ReadonlyMap<string, ProjectionRule>;
  private readonly store: ProjectionRuleExecutionStore;
  private readonly coordinator: ProjectionWaveCoordinator;
  private readonly inputContext: ProjectionInputContext;
  private readonly executionContext: ProjectionExecutionContext;
  private readonly reconcileTargets: (
    targets: ProjectionWaveRule["changedTargets"],
  ) => Promise<void>;
  private readonly now: () => number;

  constructor(options: ProjectionRuleJobHandlerOptions) {
    const ruleById = new Map<string, ProjectionRule>();
    for (const rule of options.rules) {
      if (ruleById.has(rule.id)) {
        throw new Error(`Duplicate executable projection rule "${rule.id}"`);
      }
      ruleById.set(rule.id, rule);
    }
    this.ruleById = ruleById;
    this.store = options.store;
    this.coordinator = options.coordinator;
    this.inputContext = options.inputContext;
    this.executionContext = options.executionContext;
    this.reconcileTargets = options.reconcileTargets;
    this.now = options.now;
  }

  public validateAndParse(data: unknown): ProjectionRuleJobData | null {
    const parsed = projectionRuleJobDataSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  }

  public async onTerminalError(
    _error: Error,
    data: ProjectionRuleJobData,
  ): Promise<void> {
    const parsedData = projectionRuleJobDataSchema.parse(data);
    await this.coordinator.failActiveWave(parsedData.waveId);
  }

  public async process(
    data: ProjectionRuleJobData,
    _jobId: string,
    _progressReporter: ProgressReporter,
    signal: AbortSignal,
  ): Promise<ProjectionRuleJobResult> {
    const parsedData = projectionRuleJobDataSchema.parse(data);
    const rule = this.ruleById.get(parsedData.ruleId);
    if (!rule) {
      throw new Error(
        `Projection rule "${parsedData.ruleId}" is not executable`,
      );
    }

    const [waveInputs, waveRules] = await Promise.all([
      this.store.listWaveInputs(parsedData.waveId),
      this.store.listWaveRules(parsedData.waveId),
    ]);
    const currentRule = waveRules.find(
      (candidate) => candidate.ruleId === parsedData.ruleId,
    );
    if (!currentRule) {
      throw new Error(
        `Projection rule "${parsedData.ruleId}" is not scheduled for wave "${parsedData.waveId}"`,
      );
    }

    const triggerInputs = buildTriggerInputs(
      waveInputs,
      waveRules,
      currentRule.level,
    );
    const selectedInput = await rule.selectInput(
      { waveId: parsedData.waveId, inputs: triggerInputs },
      this.inputContext,
      signal,
    );
    const inputFingerprint = rule.fingerprint(selectedInput);
    const memoKey: GetProjectionRuleMemoInput = {
      ruleId: rule.id,
      ruleVersion: rule.version,
      inputFingerprint,
    };
    const memo = await this.store.getRuleMemo(memoKey);
    const writeIntents = memo
      ? memo.writeIntents
      : await rule.derive(selectedInput, this.executionContext, signal);
    const outcome = await this.store.applyRuleResult({
      waveId: parsedData.waveId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      inputFingerprint,
      writeIntents,
      completedAt: this.now(),
    });

    await this.reconcileTargets(outcome.changedTargets);
    await this.coordinator.advanceActiveWave(parsedData.waveId);
    return {
      waveId: parsedData.waveId,
      ruleId: rule.id,
      inputFingerprint,
      changedTargets: outcome.changedTargets,
    };
  }
}

function buildTriggerInputs(
  waveInputs: readonly PersistedProjectionWaveInput[],
  waveRules: readonly ProjectionWaveRule[],
  currentLevel: number,
): ProjectionWaveInput[] {
  const ingress: ProjectionWaveInput[] = waveInputs.map((input) => ({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    revision: input.revision,
    operation: input.operation,
    generation: input.generation,
  }));
  const changedTargets: ProjectionWaveInput[] = waveRules
    .filter((rule) => rule.status === "completed" && rule.level < currentLevel)
    .flatMap((rule) =>
      rule.changedTargets.map((target) => ({
        sourceType: target.entityType,
        sourceId: target.entityId,
        revision:
          target.contentHash ??
          `deleted:${target.entityType}:${target.entityId}`,
        operation: target.operation,
      })),
    );
  return [...ingress, ...changedTargets];
}
