import type { ProjectionWaveReady } from "@brains/contracts";
import type {
  ClaimProjectionWaveInput,
  ProjectionDirtyInput,
  ProjectionIncidentInput,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
  ProjectionWaveRuleInput,
} from "@brains/entity-service";
import type { JobInfo, JobQueueEnqueueRequest } from "@brains/job-queue";
import {
  computeProjectionInputFingerprint,
  type ProjectionGraph,
  type ProjectionRule,
  type RegisteredProjection,
} from "@brains/plugins";
import { SerialQueue } from "@brains/utils/serial-queue";

export interface ProjectionWaveStore {
  getActiveWave(): Promise<ProjectionWave | null>;
  listPendingInputs(): Promise<ProjectionDirtyInput[]>;
  claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null>;
  listWaveInputs(waveId: string): Promise<ProjectionWaveInput[]>;
  putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void>;
  listWaveRules(waveId: string): Promise<ProjectionWaveRule[]>;
  queueWaveRule(
    waveId: string,
    ruleId: string,
    jobId: string,
  ): Promise<unknown>;
  completeWave(waveId: string, completedAt: number): Promise<ProjectionWave>;
  failWave(waveId: string, failedAt: number): Promise<ProjectionWave>;
  failWaveWithIncident(input: ProjectionIncidentInput): Promise<ProjectionWave>;
}

export interface ProjectionWaveQueue {
  enqueue(request: JobQueueEnqueueRequest): Promise<string>;
  getStatus(jobId: string): Promise<JobInfo | null>;
}

interface StrandedProjectionRule {
  rule: ProjectionWaveRule;
  jobStatus: JobInfo["status"] | "missing";
}

function strandedFailureReason(stranded: StrandedProjectionRule): string {
  switch (stranded.jobStatus) {
    case "failed":
      return "Projection rule job exhausted retries";
    case "completed":
      return "Projection rule job completed without applying its result";
    case "missing":
      return stranded.rule.jobId
        ? "Projection rule job is missing"
        : "Projection rule has no durable job id";
    default:
      return "Projection rule job is in an unexpected terminal state";
  }
}

export interface ProjectionWaveSchedulerOptions {
  store: ProjectionWaveStore;
  queue: ProjectionWaveQueue;
  graph: ProjectionGraph;
  rules: readonly ProjectionRule[];
  createWaveId: () => string;
  beforeWaveCompletion?:
    ((summary: ProjectionWaveReady) => Promise<void>) | undefined;
  scheduleWakeup?:
    ((delayMs: number, wakeup: () => Promise<void>) => () => void) | undefined;
  onScheduledWakeupError?: ((error: unknown) => void) | undefined;
  now: () => number;
}

export const PROJECTION_RULE_JOB_TYPE = "shell:projection-rule";

/** Scheduler-owned admission for one topological projection wave. */
export class ProjectionWaveScheduler {
  private readonly store: ProjectionWaveStore;
  private readonly queue: ProjectionWaveQueue;
  private readonly graph: ProjectionGraph;
  private readonly ruleById: ReadonlyMap<string, ProjectionRule>;
  private readonly graphFingerprint: string;
  private readonly createWaveId: () => string;
  private readonly beforeWaveCompletion: (
    summary: ProjectionWaveReady,
  ) => Promise<void>;
  private readonly scheduleWakeup: (
    delayMs: number,
    wakeup: () => Promise<void>,
  ) => () => void;
  private readonly onScheduledWakeupError: (error: unknown) => void;
  private readonly now: () => number;
  private readonly operationQueue = new SerialQueue();
  private scheduledWakeup: { readyAt: number; cancel: () => void } | undefined;

  constructor(options: ProjectionWaveSchedulerOptions) {
    this.store = options.store;
    this.queue = options.queue;
    this.graph = options.graph;
    this.ruleById = validateRuleComposition(options.graph, options.rules);
    this.graphFingerprint = fingerprintRuleComposition(
      options.graph,
      options.rules,
    );
    this.createWaveId = options.createWaveId;
    this.beforeWaveCompletion =
      options.beforeWaveCompletion ?? (async (): Promise<void> => {});
    this.scheduleWakeup = options.scheduleWakeup ?? scheduleTimerWakeup;
    this.onScheduledWakeupError =
      options.onScheduledWakeupError ?? ((): void => {});
    this.now = options.now;
  }

  public dispose(): void {
    this.cancelScheduledWakeup();
  }

  public advanceActiveWave(waveId: string): Promise<ProjectionWave> {
    return this.runExclusive(async () => {
      const activeWave = await this.store.getActiveWave();
      if (activeWave?.id !== waveId) {
        throw new Error(`Projection wave "${waveId}" is not active`);
      }
      const advanced = await this.advanceWave(activeWave);
      if (advanced.status === "completed") {
        await this.startNextWaveInternal();
      }
      return advanced;
    });
  }

  public startNextWave(): Promise<ProjectionWave | null> {
    return this.runExclusive(() => this.startNextWaveInternal());
  }

  public failActiveWave(waveId: string): Promise<ProjectionWave> {
    return this.runExclusive(async () => {
      const activeWave = await this.store.getActiveWave();
      if (activeWave?.id !== waveId) {
        throw new Error(`Projection wave "${waveId}" is not active`);
      }
      return this.store.failWave(waveId, this.now());
    });
  }

  public failActiveWaveWithIncident(
    input: Omit<ProjectionIncidentInput, "failedAt">,
  ): Promise<ProjectionWave> {
    return this.runExclusive(async () => {
      const activeWave = await this.store.getActiveWave();
      if (activeWave && activeWave.id !== input.waveId) {
        throw new Error(
          `Projection wave "${input.waveId}" is not active; "${activeWave.id}" is running`,
        );
      }
      return this.store.failWaveWithIncident({
        ...input,
        failedAt: this.now(),
      });
    });
  }

  private async startNextWaveInternal(): Promise<ProjectionWave | null> {
    const activeWave = await this.store.getActiveWave();
    if (activeWave) {
      const advanced = await this.advanceWave(activeWave);
      if (advanced.status === "completed") {
        await this.startNextWaveInternal();
      }
      return advanced;
    }

    const pendingInputs = await this.store.listPendingInputs();
    if (pendingInputs.length === 0) {
      this.cancelScheduledWakeup();
      return null;
    }
    const readyAt = getSourceChangeBatchReadyAt(
      this.graph,
      this.ruleById,
      pendingInputs,
    );
    const startedAt = this.now();
    if (readyAt > startedAt) {
      this.schedulePendingWakeup(readyAt);
      return null;
    }
    this.cancelScheduledWakeup();
    const wave = await this.store.claimPendingWave({
      waveId: this.createWaveId(),
      graphFingerprint: this.graphFingerprint,
      startedAt,
    });
    if (!wave) return null;

    const advanced = await this.advanceWave(wave);
    if (advanced.status === "completed") {
      await this.startNextWaveInternal();
    }
    return advanced;
  }

  private async runExclusive<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.operationQueue.run(operation);
  }

  private schedulePendingWakeup(readyAt: number): void {
    if (this.scheduledWakeup?.readyAt === readyAt) return;
    this.cancelScheduledWakeup();
    const scheduled = { readyAt, cancel: (): void => {} };
    scheduled.cancel = this.scheduleWakeup(
      Math.max(0, readyAt - this.now()),
      async (): Promise<void> => {
        if (this.scheduledWakeup !== scheduled) return;
        this.scheduledWakeup = undefined;
        try {
          await this.startNextWave();
        } catch (error) {
          this.onScheduledWakeupError(error);
        }
      },
    );
    this.scheduledWakeup = scheduled;
  }

  private cancelScheduledWakeup(): void {
    this.scheduledWakeup?.cancel();
    this.scheduledWakeup = undefined;
  }

  private async advanceWave(wave: ProjectionWave): Promise<ProjectionWave> {
    if (wave.graphFingerprint !== this.graphFingerprint) {
      throw new Error(
        `Projection wave "${wave.id}" graph fingerprint does not match the finalized graph`,
      );
    }
    let rules = await this.store.listWaveRules(wave.id);
    if (rules.length === 0) {
      const inputs = await this.store.listWaveInputs(wave.id);
      const plannedRules = planReachableRules(
        this.graph,
        this.ruleById,
        inputs,
      );
      if (plannedRules.length === 0) {
        return this.completeWave(wave);
      }
      await this.store.putWaveRules(wave.id, plannedRules);
      rules = await this.store.listWaveRules(wave.id);
    }
    if (rules.every((rule) => rule.status === "completed")) {
      return this.completeWave(wave, rules);
    }
    const failedRule = rules.find((rule) => rule.status === "failed");
    if (failedRule) {
      return this.store.failWaveWithIncident({
        waveId: wave.id,
        ruleId: failedRule.ruleId,
        jobId: failedRule.jobId,
        failureReason: "Projection rule is in a terminal failed state",
        failedAt: this.now(),
      });
    }
    const strandedRule = await this.findStrandedQueuedRule(rules);
    if (strandedRule) {
      return this.store.failWaveWithIncident({
        waveId: wave.id,
        ruleId: strandedRule.rule.ruleId,
        jobId: strandedRule.rule.jobId,
        failureReason: strandedFailureReason(strandedRule),
        failedAt: this.now(),
      });
    }

    const incompleteLevel = Math.min(
      ...rules
        .filter((rule) => rule.status !== "completed")
        .map((rule) => rule.level),
    );
    const pendingRules = rules.filter(
      (rule) => rule.level === incompleteLevel && rule.status === "pending",
    );
    await Promise.all(
      pendingRules.map((rule) => this.enqueueRule(wave.id, rule)),
    );
    return wave;
  }

  private async findStrandedQueuedRule(
    rules: readonly ProjectionWaveRule[],
  ): Promise<StrandedProjectionRule | null> {
    for (const rule of rules) {
      if (rule.status !== "queued") continue;
      if (!rule.jobId) return { rule, jobStatus: "missing" };
      const job = await this.queue.getStatus(rule.jobId);
      if (!job || job.status === "completed" || job.status === "failed") {
        return { rule, jobStatus: job?.status ?? "missing" };
      }
    }
    return null;
  }

  private async completeWave(
    wave: ProjectionWave,
    waveRules?: readonly ProjectionWaveRule[],
  ): Promise<ProjectionWave> {
    const [inputs, rules] = await Promise.all([
      this.store.listWaveInputs(wave.id),
      waveRules
        ? Promise.resolve(waveRules)
        : this.store.listWaveRules(wave.id),
    ]);
    await this.beforeWaveCompletion({
      waveId: wave.id,
      sourceTypes: [...new Set(inputs.map((input) => input.sourceType))].sort(),
      changedTargetTypes: [
        ...new Set(
          rules.flatMap((rule) =>
            rule.changedTargets.map((target) => target.entityType),
          ),
        ),
      ].sort(),
    });
    return this.store.completeWave(wave.id, this.now());
  }

  private async enqueueRule(
    waveId: string,
    rule: ProjectionWaveRule,
  ): Promise<void> {
    const jobId = await this.queue.enqueue({
      type: PROJECTION_RULE_JOB_TYPE,
      data: { waveId, ruleId: rule.ruleId },
      options: {
        source: "projection-scheduler",
        rootJobId: `projection-wave:${waveId}`,
        metadata: {
          operationType: "data_processing",
          operationTarget: rule.ruleId,
          silent: true,
        },
        deduplication: "coalesce",
        deduplicationKey: `projection-wave:${waveId}:${rule.ruleId}`,
        projection: { id: rule.ruleId },
      },
    });
    await this.store.queueWaveRule(waveId, rule.ruleId, jobId);
  }
}

function scheduleTimerWakeup(
  delayMs: number,
  wakeup: () => Promise<void>,
): () => void {
  const timer = setTimeout(() => {
    void wakeup();
  }, delayMs);
  return (): void => clearTimeout(timer);
}

function getSourceChangeBatchReadyAt(
  graph: ProjectionGraph,
  ruleById: ReadonlyMap<string, ProjectionRule>,
  inputs: readonly ProjectionDirtyInput[],
): number {
  const plannedRules = planReachableRules(graph, ruleById, inputs);
  const batchDelayMs = plannedRules.reduce(
    (maximum, planned) =>
      Math.max(
        maximum,
        ruleById.get(planned.ruleId)?.sourceChangeBatchDelayMs ?? 0,
      ),
    0,
  );
  if (batchDelayMs === 0) return 0;
  const latestMarkedAt = inputs.reduce(
    (latest, input) => Math.max(latest, input.markedAt),
    0,
  );
  return latestMarkedAt + batchDelayMs;
}

function validateRuleComposition(
  graph: ProjectionGraph,
  rules: readonly ProjectionRule[],
): ReadonlyMap<string, ProjectionRule> {
  const ruleById = new Map<string, ProjectionRule>();
  for (const rule of rules) {
    if (ruleById.has(rule.id)) {
      throw new Error(`Duplicate executable projection rule "${rule.id}"`);
    }
    ruleById.set(rule.id, rule);
  }

  const projectionIds = new Set(
    graph.projections.map((projection) => projection.id),
  );
  for (const projectionId of projectionIds) {
    if (!ruleById.has(projectionId)) {
      throw new Error(`Projection "${projectionId}" has no executable rule`);
    }
  }
  for (const ruleId of ruleById.keys()) {
    if (!projectionIds.has(ruleId)) {
      throw new Error(
        `Executable projection rule "${ruleId}" is not in the graph`,
      );
    }
  }
  return ruleById;
}

function fingerprintRuleComposition(
  graph: ProjectionGraph,
  rules: readonly ProjectionRule[],
): string {
  return computeProjectionInputFingerprint({
    projections: graph.projections,
    edges: graph.edges,
    rules: [...rules]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((rule) => ({ id: rule.id, version: rule.version })),
  });
}

function planReachableRules(
  graph: ProjectionGraph,
  ruleById: ReadonlyMap<string, ProjectionRule>,
  inputs: readonly Pick<ProjectionWaveInput, "sourceType">[],
): ProjectionWaveRuleInput[] {
  const projectionById = new Map(
    graph.projections.map((projection) => [projection.id, projection]),
  );
  const successorsByFrom = groupEdges(graph, (edge) => [edge.from, edge.to]);
  const reachable = new Set(
    graph.projections
      .filter((projection) => isTriggeredBy(projection, inputs))
      .map((projection) => projection.id),
  );

  let frontier = [...reachable];
  while (frontier.length > 0) {
    const next = frontier
      .flatMap((id) => successorsByFrom.get(id) ?? [])
      .filter((id) => projectionById.has(id) && !reachable.has(id));
    for (const id of next) reachable.add(id);
    frontier = [...new Set(next)].sort();
  }

  const levelById = assignTopologicalLevels(graph, reachable);
  return [...reachable]
    .map((ruleId) => {
      const projection = projectionById.get(ruleId);
      const rule = ruleById.get(ruleId);
      const level = levelById.get(ruleId);
      if (!projection || !rule || level === undefined) {
        throw new Error(`Cannot plan projection rule "${ruleId}"`);
      }
      return {
        ruleId,
        targetType: projection.targetType,
        level,
      };
    })
    .sort(
      (left, right) =>
        left.level - right.level || left.ruleId.localeCompare(right.ruleId),
    );
}

function isTriggeredBy(
  projection: RegisteredProjection,
  inputs: readonly Pick<ProjectionWaveInput, "sourceType">[],
): boolean {
  return projection.sources.some((source) => {
    const excluded = new Set(source.excludeTypes ?? []);
    return inputs.some(
      (input) =>
        !excluded.has(input.sourceType) &&
        (source.types.includes("*") || source.types.includes(input.sourceType)),
    );
  });
}

function assignTopologicalLevels(
  graph: ProjectionGraph,
  reachable: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const reachablePredecessors = groupEdges(graph, (edge) =>
    reachable.has(edge.from) ? [edge.to, edge.from] : undefined,
  );
  const levelById = new Map<string, number>();
  const unresolved = new Set(reachable);

  while (unresolved.size > 0) {
    const ready = [...unresolved]
      .filter((id) =>
        (reachablePredecessors.get(id) ?? []).every((from) =>
          levelById.has(from),
        ),
      )
      .sort();
    if (ready.length === 0) {
      throw new Error("Reachable projection graph is not acyclic");
    }

    for (const id of ready) {
      const predecessorLevels = (reachablePredecessors.get(id) ?? [])
        .map((from) => levelById.get(from))
        .filter((level) => level !== undefined);
      const level =
        predecessorLevels.length === 0 ? 0 : Math.max(...predecessorLevels) + 1;
      levelById.set(id, level);
      unresolved.delete(id);
    }
  }

  return levelById;
}

/** Index graph edges once as key → values via the supplied [key, value] map. */
function groupEdges(
  graph: ProjectionGraph,
  entry: (
    edge: ProjectionGraph["edges"][number],
  ) => [string, string] | undefined,
): ReadonlyMap<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const mapped = entry(edge);
    if (!mapped) continue;
    const [key, value] = mapped;
    const values = grouped.get(key);
    if (values) values.push(value);
    else grouped.set(key, [value]);
  }
  return grouped;
}
