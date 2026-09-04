import type {
  ApplyProjectionRuleResultInput,
  GetProjectionRuleMemoInput,
  ProjectionDirtyInput,
  ProjectionRuleMemoValue,
  ProjectionWriteIntent,
  ProjectionWave,
  ProjectionWaveRule,
} from "@brains/entity-service";
import type { JobHandler, JobInfo } from "@brains/job-queue";
import type {
  ProjectionExecutionContext,
  ProjectionInputContext,
  ProjectionRule,
  ProjectionWaveInput,
} from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type { PROJECTION_RULE_JOB_TYPE } from "./projection-wave-scheduler";

const projectionRuleJobDataSchema: z.ZodObject<
  { waveId: z.ZodString; ruleId: z.ZodString },
  z.core.$strict
> = z.strictObject({
  waveId: z.string().trim().min(1),
  ruleId: z.string().trim().min(1),
});

export type ProjectionRuleJobData = z.output<
  typeof projectionRuleJobDataSchema
>;

export interface ProjectionRuleJobResult {
  waveId: string;
  ruleId: string;
  outcome: "applied" | "superseded";
  inputFingerprint: string | null;
  changedTargets: ProjectionWaveRule["changedTargets"];
}

interface PersistedProjectionWaveInput extends ProjectionWaveInput {
  waveId: string;
  generation: number;
}

export interface ProjectionRuleExecutionStore {
  getWave(waveId: string): Promise<ProjectionWave | null>;
  listPendingInputs(): Promise<ProjectionDirtyInput[]>;
  supersedeWaveIfStale(waveId: string, supersededAt: number): Promise<boolean>;
  listWaveInputs(waveId: string): Promise<PersistedProjectionWaveInput[]>;
  listWaveRules(waveId: string): Promise<ProjectionWaveRule[]>;
  getRuleMemo(
    input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null>;
  applyRuleResult(
    input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule | null>;
}

export interface ProjectionWaveCoordinator {
  advanceActiveWave(waveId: string): Promise<unknown>;
  failActiveWave(waveId: string): Promise<unknown>;
  continueAfterSupersession(waveId: string): Promise<unknown>;
  failActiveWaveWithIncident(input: {
    waveId: string;
    ruleId: string;
    jobId: string | null;
    failureReason: string;
  }): Promise<unknown>;
}

export type ProjectionRuleDiagnosticEvent =
  | "attempt-started"
  | "input-selected"
  | "memo-resolved"
  | "derive-started"
  | "derive-completed"
  | "derive-cancelled"
  | "derive-failed"
  | "apply-completed";

/** Bounded, content-free evidence emitted by one projection rule attempt. */
export interface ProjectionRuleDiagnostic {
  event: ProjectionRuleDiagnosticEvent;
  waveId: string;
  ruleId: string;
  ruleVersion: string;
  jobId: string;
  attemptNumber: number;
  cutoffGeneration: number;
  inputFingerprint?: string | undefined;
  selectedSourceCount?: number | undefined;
  memoHit?: boolean | undefined;
  applyOutcome?: "applied" | "superseded" | undefined;
  highestPendingGeneration?: number | null | undefined;
}

export interface ProjectionRuleJobHandlerOptions {
  rules: readonly ProjectionRule[];
  store: ProjectionRuleExecutionStore;
  coordinator: ProjectionWaveCoordinator;
  getJobStatus?: ((jobId: string) => Promise<JobInfo | null>) | undefined;
  onDiagnostic?:
    | ((diagnostic: ProjectionRuleDiagnostic) => void | Promise<void>)
    | undefined;
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
  private readonly getJobStatus: (jobId: string) => Promise<JobInfo | null>;
  private readonly onDiagnostic:
    | ((diagnostic: ProjectionRuleDiagnostic) => void | Promise<void>)
    | undefined;
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
    this.getJobStatus =
      options.getJobStatus ?? (async (): Promise<JobInfo | null> => null);
    this.onDiagnostic = options.onDiagnostic;
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
    jobId: string,
  ): Promise<void> {
    const parsedData = projectionRuleJobDataSchema.parse(data);
    await this.coordinator.failActiveWaveWithIncident({
      waveId: parsedData.waveId,
      ruleId: parsedData.ruleId,
      jobId,
      failureReason: "Projection rule job exhausted retries",
    });
  }

  public async process(
    data: ProjectionRuleJobData,
    jobId: string,
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

    const [waveInputs, waveRules, wave, job] = await Promise.all([
      this.store.listWaveInputs(parsedData.waveId),
      this.store.listWaveRules(parsedData.waveId),
      this.store.getWave(parsedData.waveId),
      this.getJobStatus(jobId),
    ]);
    if (!wave) {
      throw new Error(`Projection wave "${parsedData.waveId}" does not exist`);
    }
    if (wave.status !== "running" && wave.status !== "superseded") {
      throw new Error(`Projection wave "${parsedData.waveId}" is not active`);
    }
    const currentRule = waveRules.find(
      (candidate) => candidate.ruleId === parsedData.ruleId,
    );
    if (!currentRule) {
      throw new Error(
        `Projection rule "${parsedData.ruleId}" is not scheduled for wave "${parsedData.waveId}"`,
      );
    }

    const diagnosticBase = {
      waveId: parsedData.waveId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      jobId,
      attemptNumber: (job?.retryCount ?? 0) + 1,
      cutoffGeneration: wave.cutoffGeneration,
    };
    await this.recordDiagnostic({
      ...diagnosticBase,
      event: "attempt-started",
    });
    if (wave.status === "superseded") {
      const pendingInputs = await this.store.listPendingInputs();
      await this.recordDiagnostic({
        ...diagnosticBase,
        event: "apply-completed",
        applyOutcome: "superseded",
        highestPendingGeneration: highestGeneration(pendingInputs),
      });
      return {
        waveId: parsedData.waveId,
        ruleId: rule.id,
        outcome: "superseded",
        inputFingerprint: null,
        changedTargets: [],
      };
    }
    if (await this.store.supersedeWaveIfStale(parsedData.waveId, this.now())) {
      const pendingInputs = await this.store.listPendingInputs();
      await this.recordDiagnostic({
        ...diagnosticBase,
        event: "apply-completed",
        applyOutcome: "superseded",
        highestPendingGeneration: highestGeneration(pendingInputs),
      });
      await this.coordinator.continueAfterSupersession(parsedData.waveId);
      return {
        waveId: parsedData.waveId,
        ruleId: rule.id,
        outcome: "superseded",
        inputFingerprint: null,
        changedTargets: [],
      };
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
    const selectedDiagnostic = {
      ...diagnosticBase,
      inputFingerprint,
      selectedSourceCount: selectedSourceCount(selectedInput, triggerInputs),
    };
    await this.recordDiagnostic({
      ...selectedDiagnostic,
      event: "input-selected",
    });

    const memoKey: GetProjectionRuleMemoInput = {
      ruleId: rule.id,
      ruleVersion: rule.version,
      inputFingerprint,
    };
    const memo = await this.store.getRuleMemo(memoKey);
    await this.recordDiagnostic({
      ...selectedDiagnostic,
      event: "memo-resolved",
      memoHit: memo !== null,
    });

    let writeIntents: readonly ProjectionWriteIntent[];
    if (memo) {
      writeIntents = memo.writeIntents;
    } else {
      await this.recordDiagnostic({
        ...selectedDiagnostic,
        event: "derive-started",
        memoHit: false,
      });
      try {
        writeIntents = await rule.derive(
          selectedInput,
          this.executionContext,
          signal,
        );
        await this.recordDiagnostic({
          ...selectedDiagnostic,
          event: "derive-completed",
          memoHit: false,
        });
      } catch (error) {
        await this.recordDiagnostic({
          ...selectedDiagnostic,
          event: signal.aborted ? "derive-cancelled" : "derive-failed",
          memoHit: false,
        });
        throw error;
      }
    }

    const outcome = await this.store.applyRuleResult({
      waveId: parsedData.waveId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      inputFingerprint,
      writeIntents,
      completedAt: this.now(),
    });
    const pendingInputs = await this.store.listPendingInputs();
    if (!outcome) {
      await this.recordDiagnostic({
        ...selectedDiagnostic,
        event: "apply-completed",
        memoHit: memo !== null,
        applyOutcome: "superseded",
        highestPendingGeneration: highestGeneration(pendingInputs),
      });
      await this.coordinator.continueAfterSupersession(parsedData.waveId);
      return {
        waveId: parsedData.waveId,
        ruleId: rule.id,
        outcome: "superseded",
        inputFingerprint,
        changedTargets: [],
      };
    }
    await this.recordDiagnostic({
      ...selectedDiagnostic,
      event: "apply-completed",
      memoHit: memo !== null,
      applyOutcome: "applied",
      highestPendingGeneration: highestGeneration(pendingInputs),
    });

    await this.reconcileTargets(outcome.changedTargets);
    await this.coordinator.advanceActiveWave(parsedData.waveId);
    return {
      waveId: parsedData.waveId,
      ruleId: rule.id,
      outcome: "applied",
      inputFingerprint,
      changedTargets: outcome.changedTargets,
    };
  }

  private async recordDiagnostic(
    diagnostic: ProjectionRuleDiagnostic,
  ): Promise<void> {
    if (!this.onDiagnostic) return;
    try {
      await this.onDiagnostic(diagnostic);
    } catch (error) {
      this.executionContext.logger.warn(
        "Projection diagnostics callback failed",
        error,
      );
    }
  }
}

function selectedSourceCount(
  selectedInput: unknown,
  triggerInputs: readonly ProjectionWaveInput[],
): number {
  if (
    typeof selectedInput === "object" &&
    selectedInput !== null &&
    "sources" in selectedInput &&
    Array.isArray(selectedInput.sources)
  ) {
    return selectedInput.sources.length;
  }
  return triggerInputs.length;
}

function highestGeneration(
  inputs: readonly ProjectionDirtyInput[],
): number | null {
  if (inputs.length === 0) return null;
  return inputs.reduce(
    (highest, input) => Math.max(highest, input.generation),
    inputs[0]?.generation ?? 0,
  );
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
