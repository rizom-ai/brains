import type { ProjectionWaveReady } from "@brains/contracts";
import type {
  ClaimProjectionWaveInput,
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
}

export interface ProjectionWaveQueue {
  enqueue(request: JobQueueEnqueueRequest): Promise<string>;
  getStatus(jobId: string): Promise<JobInfo | null>;
}

export interface ProjectionWaveSchedulerOptions {
  store: ProjectionWaveStore;
  queue: ProjectionWaveQueue;
  graph: ProjectionGraph;
  rules: readonly ProjectionRule[];
  createWaveId: () => string;
  beforeWaveCompletion?:
    ((summary: ProjectionWaveReady) => Promise<void>) | undefined;
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
  private readonly now: () => number;
  private readonly operationQueue = new SerialQueue();

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
    this.now = options.now;
  }

  public advanceActiveWave(waveId: string): Promise<ProjectionWave> {
    return this.runExclusive(async () => {
      const activeWave = await this.store.getActiveWave();
      if (activeWave?.id !== waveId) {
        throw new Error(`Projection wave "${waveId}" is not active`);
      }
      const advanced = await this.advanceWave(activeWave);
      if (advanced.status !== "running") {
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

  private async startNextWaveInternal(): Promise<ProjectionWave | null> {
    const activeWave = await this.store.getActiveWave();
    if (activeWave) {
      const advanced = await this.advanceWave(activeWave);
      if (advanced.status !== "running") {
        await this.startNextWaveInternal();
      }
      return advanced;
    }

    const startedAt = this.now();
    const wave = await this.store.claimPendingWave({
      waveId: this.createWaveId(),
      graphFingerprint: this.graphFingerprint,
      startedAt,
    });
    if (!wave) return null;

    const inputs = await this.store.listWaveInputs(wave.id);
    const plannedRules = planReachableRules(this.graph, this.ruleById, inputs);
    if (plannedRules.length === 0) {
      const completed = await this.completeWave(wave);
      await this.startNextWaveInternal();
      return completed;
    }

    await this.store.putWaveRules(wave.id, plannedRules);
    return this.advanceWave(wave);
  }

  private async runExclusive<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.operationQueue.run(operation);
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
      return this.store.failWave(wave.id, this.now());
    }
    const strandedRule = await this.findStrandedQueuedRule(rules);
    if (strandedRule) {
      return this.store.failWave(wave.id, this.now());
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
  ): Promise<ProjectionWaveRule | null> {
    for (const rule of rules) {
      if (rule.status !== "queued") continue;
      if (!rule.jobId) return rule;
      const job = await this.queue.getStatus(rule.jobId);
      if (!job || job.status === "completed" || job.status === "failed") {
        return rule;
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
  inputs: readonly ProjectionWaveInput[],
): ProjectionWaveRuleInput[] {
  const projectionById = new Map(
    graph.projections.map((projection) => [projection.id, projection]),
  );
  const reachable = new Set(
    graph.projections
      .filter((projection) => isTriggeredBy(projection, inputs))
      .map((projection) => projection.id),
  );

  let frontier = [...reachable];
  while (frontier.length > 0) {
    const next = graph.edges
      .filter((edge) => frontier.includes(edge.from))
      .map((edge) => edge.to)
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
  inputs: readonly ProjectionWaveInput[],
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
  const levelById = new Map<string, number>();
  const unresolved = new Set(reachable);

  while (unresolved.size > 0) {
    const ready = [...unresolved]
      .filter((id) =>
        graph.edges
          .filter((edge) => edge.to === id && reachable.has(edge.from))
          .every((edge) => levelById.has(edge.from)),
      )
      .sort();
    if (ready.length === 0) {
      throw new Error("Reachable projection graph is not acyclic");
    }

    for (const id of ready) {
      const predecessorLevels = graph.edges
        .filter((edge) => edge.to === id && reachable.has(edge.from))
        .map((edge) => levelById.get(edge.from))
        .filter((level) => level !== undefined);
      const level =
        predecessorLevels.length === 0 ? 0 : Math.max(...predecessorLevels) + 1;
      levelById.set(id, level);
      unresolved.delete(id);
    }
  }

  return levelById;
}
