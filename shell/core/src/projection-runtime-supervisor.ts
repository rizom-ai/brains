import type { OperationProvenance } from "@brains/contracts";
import type { OperationContext } from "@brains/operation-context";
import type { ProjectionGraph, RegisteredProjection } from "@brains/plugins";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/runtime-state";
import { z } from "@brains/utils/zod";

export interface ProjectionMutationTarget {
  operation: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
}

export interface ProjectionCircuitDiagnostic {
  projectionId: string;
  reason: string;
  openedAt: number;
  expiresAt: number;
}

export interface ProjectionRuntimeDiagnostics {
  status: "healthy" | "unhealthy";
  initialized: boolean;
  trackedRoots: number;
  openCircuits: ProjectionCircuitDiagnostic[];
}

export interface ProjectionJobAdmissionReservation {
  commit(): void;
  rollback(): void;
}

export interface ProjectionRuntimeSupervisorOptions {
  maxDerivationDepth?: number;
  maxJobsPerRoot?: number;
  maxMutationsPerRoot?: number;
  repeatedTargetLimit?: number;
  retentionMs?: number;
  circuitOpenMs?: number;
  maxTrackedRoots?: number;
  now?: () => number;
  runtimeState?: IRuntimeStateNamespace;
}

type ResolvedSupervisorOptions = Required<
  Omit<ProjectionRuntimeSupervisorOptions, "runtimeState">
>;

interface RootCounters {
  jobs: number;
  mutations: number;
  targetMutations: Map<string, number>;
  updatedAt: number;
}

const ProjectionCircuitStateSchema: z.ZodType<ProjectionCircuitDiagnostic> =
  z.object({
    projectionId: z.string().min(1),
    reason: z.string().min(1),
    openedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
  });

const DEFAULT_MAX_DERIVATION_DEPTH = 8;
const DEFAULT_MAX_JOBS_PER_ROOT = 32;
const DEFAULT_MAX_MUTATIONS_PER_ROOT = 128;
const DEFAULT_REPEATED_TARGET_LIMIT = 5;
const DEFAULT_RETENTION_MS = 10 * 60_000;
const DEFAULT_CIRCUIT_OPEN_MS = 10 * 60_000;
const DEFAULT_MAX_TRACKED_ROOTS = 1_000;
const CIRCUIT_STATE_NAMESPACE = "shell.projection-circuits";

/** App-scoped causal budgets and durable circuits for projection execution. */
export class ProjectionRuntimeSupervisor {
  private readonly operationContext: OperationContext;
  private readonly options: ResolvedSupervisorOptions;
  private readonly circuitStore:
    IRuntimeStateStore<ProjectionCircuitDiagnostic> | undefined;
  private readonly roots = new Map<string, RootCounters>();
  private readonly reservedJobs = new Map<string, number>();
  private readonly circuits = new Map<string, ProjectionCircuitDiagnostic>();
  private projections: ReadonlyMap<string, RegisteredProjection> | undefined;

  public static createFresh(
    operationContext: OperationContext,
    options: ProjectionRuntimeSupervisorOptions = {},
  ): ProjectionRuntimeSupervisor {
    return new ProjectionRuntimeSupervisor(operationContext, options);
  }

  private constructor(
    operationContext: OperationContext,
    options: ProjectionRuntimeSupervisorOptions,
  ) {
    this.operationContext = operationContext;
    this.options = {
      maxDerivationDepth:
        options.maxDerivationDepth ?? DEFAULT_MAX_DERIVATION_DEPTH,
      maxJobsPerRoot: options.maxJobsPerRoot ?? DEFAULT_MAX_JOBS_PER_ROOT,
      maxMutationsPerRoot:
        options.maxMutationsPerRoot ?? DEFAULT_MAX_MUTATIONS_PER_ROOT,
      repeatedTargetLimit:
        options.repeatedTargetLimit ?? DEFAULT_REPEATED_TARGET_LIMIT,
      retentionMs: options.retentionMs ?? DEFAULT_RETENTION_MS,
      circuitOpenMs: options.circuitOpenMs ?? DEFAULT_CIRCUIT_OPEN_MS,
      maxTrackedRoots: options.maxTrackedRoots ?? DEFAULT_MAX_TRACKED_ROOTS,
      now: options.now ?? Date.now,
    };
    for (const [name, value] of Object.entries(this.options)) {
      if (name === "now") continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
      }
    }
    this.circuitStore = options.runtimeState?.scoped({
      namespace: CIRCUIT_STATE_NAMESPACE,
      schema: ProjectionCircuitStateSchema,
    });
  }

  public async initialize(graph: ProjectionGraph): Promise<void> {
    if (this.projections) {
      throw new Error("Projection runtime supervisor is already initialized");
    }
    this.projections = new Map(
      graph.projections.map((projection) => [projection.id, projection]),
    );

    if (!this.circuitStore) return;
    const now = this.options.now();
    for (const record of await this.circuitStore.list()) {
      const circuit = record.value;
      if (
        circuit.expiresAt <= now ||
        !this.projections.has(circuit.projectionId)
      ) {
        await this.circuitStore.delete(record.key);
        continue;
      }
      this.circuits.set(circuit.projectionId, circuit);
    }
  }

  public async reserveJobAdmission(
    provenance: OperationProvenance,
  ): Promise<ProjectionJobAdmissionReservation> {
    const projectionId = provenance.projectionId;
    if (!projectionId) return this.createNoopJobReservation();

    const now = this.options.now();
    await this.prune(now);
    await this.requireProjection(projectionId, now);
    await this.assertCircuitClosed(projectionId, now);
    await this.assertDepth(provenance, now);

    const repeats = provenance.projectionLineage.filter(
      (id) => id === projectionId,
    ).length;
    if (repeats > 1) {
      await this.rejectAndOpen(
        projectionId,
        `Projection ${projectionId} repeats in one causal lineage`,
        now,
      );
    }

    const rootJobId = provenance.rootJobId;
    const committedJobs = this.roots.get(rootJobId)?.jobs ?? 0;
    const reservedJobs = this.reservedJobs.get(rootJobId) ?? 0;
    if (committedJobs + reservedJobs + 1 > this.options.maxJobsPerRoot) {
      await this.rejectAndOpen(
        projectionId,
        `Root ${rootJobId} exceeded projection job budget ${this.options.maxJobsPerRoot}`,
        now,
      );
    }
    this.reservedJobs.set(rootJobId, reservedJobs + 1);

    let settled = false;
    const settle = (commit: boolean): void => {
      if (settled) return;
      settled = true;
      this.releaseJobReservation(rootJobId);
      if (!commit) return;

      const committedAt = this.options.now();
      const counters = this.getRootCounters(rootJobId, committedAt);
      counters.jobs++;
      counters.updatedAt = committedAt;
    };

    return {
      commit: (): void => settle(true),
      rollback: (): void => settle(false),
    };
  }

  public async assertMutationAdmission(
    target: ProjectionMutationTarget,
  ): Promise<void> {
    const current = this.operationContext.current()?.provenance;
    const projectionId = current?.projectionId;
    if (!current || !projectionId) return;

    const now = this.options.now();
    await this.prune(now);
    await this.requireProjection(projectionId, now);
    await this.assertCircuitClosed(projectionId, now);

    const counters = this.getRootCounters(current.rootJobId, now);
    counters.mutations++;
    counters.updatedAt = now;
    if (counters.mutations > this.options.maxMutationsPerRoot) {
      await this.rejectAndOpen(
        projectionId,
        `Root ${current.rootJobId} exceeded projection mutation budget ${this.options.maxMutationsPerRoot}`,
        now,
      );
    }

    const targetKey = `${projectionId}\u0000${target.entityType}\u0000${target.entityId}`;
    const targetCount = (counters.targetMutations.get(targetKey) ?? 0) + 1;
    counters.targetMutations.set(targetKey, targetCount);
    if (targetCount > this.options.repeatedTargetLimit) {
      await this.rejectAndOpen(
        projectionId,
        `Projection ${projectionId} repeatedly mutated ${target.entityType}:${target.entityId}`,
        now,
      );
    }
  }

  public async getDiagnostics(): Promise<ProjectionRuntimeDiagnostics> {
    const now = this.options.now();
    await this.prune(now);
    const openCircuits = Array.from(this.circuits.values())
      .sort((left, right) =>
        left.projectionId.localeCompare(right.projectionId),
      )
      .map((circuit) => ({ ...circuit }));
    return {
      status: openCircuits.length > 0 ? "unhealthy" : "healthy",
      initialized: this.projections !== undefined,
      trackedRoots: this.roots.size,
      openCircuits,
    };
  }

  private async requireProjection(
    projectionId: string,
    now: number,
  ): Promise<RegisteredProjection> {
    if (!this.projections) {
      throw new Error("Projection runtime supervisor is not initialized");
    }
    const projection = this.projections.get(projectionId);
    if (!projection) {
      await this.rejectAndOpen(
        projectionId,
        `Projection ${projectionId} is not declared in the validated graph`,
        now,
      );
      throw new Error(`Projection ${projectionId} is not declared`);
    }
    return projection;
  }

  private async assertDepth(
    provenance: OperationProvenance,
    now: number,
  ): Promise<void> {
    const projectionId = provenance.projectionId;
    if (!projectionId) return;
    if (provenance.derivationDepth > this.options.maxDerivationDepth) {
      await this.rejectAndOpen(
        projectionId,
        `Projection ${projectionId} depth ${provenance.derivationDepth} exceeds global maximum ${this.options.maxDerivationDepth}`,
        now,
      );
    }
  }

  private async assertCircuitClosed(
    projectionId: string,
    now: number,
  ): Promise<void> {
    const circuit = this.circuits.get(projectionId);
    if (!circuit) return;
    if (circuit.expiresAt <= now) {
      this.circuits.delete(projectionId);
      await this.circuitStore?.delete(projectionId);
      return;
    }
    throw new Error(
      `Projection circuit ${projectionId} is open: ${circuit.reason}`,
    );
  }

  private async rejectAndOpen(
    projectionId: string,
    reason: string,
    now: number,
  ): Promise<never> {
    const circuit: ProjectionCircuitDiagnostic = {
      projectionId,
      reason,
      openedAt: now,
      expiresAt: now + this.options.circuitOpenMs,
    };
    this.circuits.set(projectionId, circuit);
    try {
      await this.circuitStore?.set(projectionId, circuit);
    } catch (error) {
      throw new Error(
        `Projection ${projectionId} was rejected but its circuit could not be persisted`,
        { cause: error },
      );
    }
    throw new Error(reason);
  }

  private createNoopJobReservation(): ProjectionJobAdmissionReservation {
    return {
      commit: (): void => {},
      rollback: (): void => {},
    };
  }

  private releaseJobReservation(rootJobId: string): void {
    const count = this.reservedJobs.get(rootJobId);
    if (count === undefined || count <= 1) {
      this.reservedJobs.delete(rootJobId);
      return;
    }
    this.reservedJobs.set(rootJobId, count - 1);
  }

  private getRootCounters(rootJobId: string, now: number): RootCounters {
    const existing = this.roots.get(rootJobId);
    if (existing) return existing;

    if (this.roots.size >= this.options.maxTrackedRoots) {
      const oldest = Array.from(this.roots.entries()).sort(
        ([leftId, left], [rightId, right]) =>
          left.updatedAt - right.updatedAt || leftId.localeCompare(rightId),
      )[0];
      if (oldest) this.roots.delete(oldest[0]);
    }

    const counters: RootCounters = {
      jobs: 0,
      mutations: 0,
      targetMutations: new Map(),
      updatedAt: now,
    };
    this.roots.set(rootJobId, counters);
    return counters;
  }

  private async prune(now: number): Promise<void> {
    for (const [rootJobId, counters] of this.roots) {
      if (now - counters.updatedAt >= this.options.retentionMs) {
        this.roots.delete(rootJobId);
      }
    }
    for (const [projectionId, circuit] of this.circuits) {
      if (circuit.expiresAt <= now) {
        this.circuits.delete(projectionId);
        await this.circuitStore?.delete(projectionId);
      }
    }
  }
}
