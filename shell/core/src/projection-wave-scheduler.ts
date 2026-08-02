import type {
  ClaimProjectionWaveInput,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
  ProjectionWaveRuleInput,
} from "@brains/entity-service";
import type { JobQueueEnqueueRequest } from "@brains/job-queue";
import {
  computeProjectionInputFingerprint,
  type ProjectionGraph,
  type ProjectionRule,
  type RegisteredProjection,
} from "@brains/plugins";

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
}

export interface ProjectionWaveQueue {
  enqueue(request: JobQueueEnqueueRequest): Promise<string>;
}

export interface ProjectionWaveSchedulerOptions {
  store: ProjectionWaveStore;
  queue: ProjectionWaveQueue;
  graph: ProjectionGraph;
  rules: readonly ProjectionRule[];
  createWaveId: () => string;
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
  private readonly now: () => number;

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
    this.now = options.now;
  }

  public async advanceActiveWave(waveId: string): Promise<ProjectionWave> {
    const activeWave = await this.store.getActiveWave();
    if (activeWave?.id !== waveId) {
      throw new Error(`Projection wave "${waveId}" is not active`);
    }
    return this.advanceWave(activeWave);
  }

  public async startNextWave(): Promise<ProjectionWave | null> {
    const activeWave = await this.store.getActiveWave();
    if (activeWave) return this.advanceWave(activeWave);

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
      return this.store.completeWave(wave.id, this.now());
    }

    await this.store.putWaveRules(wave.id, plannedRules);
    return this.advanceWave(wave);
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
        return this.store.completeWave(wave.id, this.now());
      }
      await this.store.putWaveRules(wave.id, plannedRules);
      rules = await this.store.listWaveRules(wave.id);
    }
    if (rules.every((rule) => rule.status === "completed")) {
      return this.store.completeWave(wave.id, this.now());
    }
    const failedRule = rules.find((rule) => rule.status === "failed");
    if (failedRule) {
      throw new Error(
        `Projection rule "${failedRule.ruleId}" failed for wave "${wave.id}"`,
      );
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

  private async enqueueRule(
    waveId: string,
    rule: ProjectionWaveRule,
  ): Promise<void> {
    const jobId = await this.queue.enqueue({
      type: PROJECTION_RULE_JOB_TYPE,
      data: { waveId, ruleId: rule.ruleId },
      options: {
        source: "projection-scheduler",
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

  const waveProjectionIds = new Set(
    graph.projections
      .filter((projection) => projection.executionOwner === "wave-owned")
      .map((projection) => projection.id),
  );
  for (const projectionId of waveProjectionIds) {
    if (!ruleById.has(projectionId)) {
      throw new Error(
        `Wave-owned projection "${projectionId}" has no executable rule`,
      );
    }
  }
  for (const ruleId of ruleById.keys()) {
    if (!waveProjectionIds.has(ruleId)) {
      throw new Error(
        `Executable projection rule "${ruleId}" is not wave-owned in the graph`,
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
  const waveProjections = graph.projections.filter(
    (projection) => projection.executionOwner === "wave-owned",
  );
  const projectionById = new Map(
    waveProjections.map((projection) => [projection.id, projection]),
  );
  const reachable = new Set(
    waveProjections
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
  if (
    inputs.some(
      (input) => input.kind === "rule" && input.sourceId === projection.id,
    )
  ) {
    return true;
  }

  return projection.sources.some((source) => {
    if (source.kind !== "entity") return false;
    const excluded = new Set(source.excludeTypes ?? []);
    return inputs.some(
      (input) =>
        input.kind === "entity" &&
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
