import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

export type SiteBuildEnvironment = "preview" | "production";
export type ActiveSiteBuildState = "debouncing" | "queued" | "building";

export interface ActiveSiteBuild {
  jobId?: string | undefined;
  state: ActiveSiteBuildState;
  requestedAt: string;
  startedAt?: string | undefined;
}

export interface SiteBuildSuccess {
  jobId: string;
  completedAt: string;
  routesBuilt: number;
  warnings: string[];
}

export interface SiteBuildFailure {
  jobId: string;
  completedAt: string;
  message: string;
}

export interface SiteBuildCancellation {
  jobId: string;
  completedAt: string;
  message: string;
}

export interface SiteBuildEnvironmentStatus {
  environment: SiteBuildEnvironment;
  active?: ActiveSiteBuild | undefined;
  lastSuccess?: SiteBuildSuccess | undefined;
  lastFailure?: SiteBuildFailure | undefined;
  lastCancellation?: SiteBuildCancellation | undefined;
}

export interface RecentSiteBuild {
  jobId: string;
  environment: SiteBuildEnvironment;
  outcome: "succeeded" | "failed" | "cancelled";
  completedAt: string;
  routesBuilt?: number | undefined;
  warnings?: string[] | undefined;
  message?: string | undefined;
}

interface StoredSiteBuildStatus {
  preview: Omit<SiteBuildEnvironmentStatus, "environment">;
  production: Omit<SiteBuildEnvironmentStatus, "environment">;
  recentBuilds: RecentSiteBuild[];
}

export interface SiteBuildStatusSnapshot {
  environments: SiteBuildEnvironmentStatus[];
  recentBuilds: RecentSiteBuild[];
}

const activeSiteBuildSchema = z.object({
  jobId: z.string().optional(),
  state: z.enum(["debouncing", "queued", "building"]),
  requestedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
});

const siteBuildSuccessSchema = z.object({
  jobId: z.string(),
  completedAt: z.string().datetime(),
  routesBuilt: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

const siteBuildFailureSchema = z.object({
  jobId: z.string(),
  completedAt: z.string().datetime(),
  message: z.string(),
});

const siteBuildCancellationSchema = z.object({
  jobId: z.string(),
  completedAt: z.string().datetime(),
  message: z.string(),
});

const environmentStatusSchema = z.object({
  active: activeSiteBuildSchema.optional(),
  lastSuccess: siteBuildSuccessSchema.optional(),
  lastFailure: siteBuildFailureSchema.optional(),
  lastCancellation: siteBuildCancellationSchema.optional(),
});

const recentSiteBuildSchema = z.object({
  jobId: z.string(),
  environment: z.enum(["preview", "production"]),
  outcome: z.enum(["succeeded", "failed", "cancelled"]),
  completedAt: z.string().datetime(),
  routesBuilt: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()).optional(),
  message: z.string().optional(),
});

const storedSiteBuildStatusSchema: z.ZodType<StoredSiteBuildStatus> = z.object({
  preview: environmentStatusSchema,
  production: environmentStatusSchema,
  recentBuilds: z.array(recentSiteBuildSchema).max(5),
});

const terminalJobResultSchema = z.object({
  success: z.boolean(),
  cancelled: z.boolean().optional(),
  routesBuilt: z.number().int().nonnegative(),
  warnings: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
});

const EMPTY_STATUS: StoredSiteBuildStatus = {
  preview: {},
  production: {},
  recentBuilds: [],
};

const STATUS_KEY = "current";
const STATUS_NAMESPACE = "site-builder.build-status";

/**
 * Persists a bounded, browser-safe projection of site-build jobs.
 * The job queue remains the execution authority; this service adds site-domain meaning.
 */
export class SiteBuildStatusService {
  private readonly store: IRuntimeStateStore<StoredSiteBuildStatus>;
  private readonly jobs: Pick<ServicePluginContext["jobs"], "getStatus">;
  private statePromise: Promise<StoredSiteBuildStatus> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    runtimeState: IRuntimeStateNamespace,
    jobs: ServicePluginContext["jobs"],
  ) {
    this.store = runtimeState.scoped({
      namespace: STATUS_NAMESPACE,
      schema: storedSiteBuildStatusSchema,
    });
    this.jobs = jobs;
  }

  async initialize(): Promise<void> {
    const state = await this.load();
    let changed = false;

    const environments: SiteBuildEnvironment[] = ["preview", "production"];
    for (const environment of environments) {
      const current = state[environment];
      const active = current.active;
      if (!active) continue;
      if (!active.jobId) {
        delete current.active;
        changed = true;
        continue;
      }

      const job = await this.jobs.getStatus(active.jobId);
      if (!job) {
        delete current.active;
        changed = true;
        continue;
      }

      if (job.status === "pending") {
        current.active = { ...active, state: "queued" };
        changed = true;
        continue;
      }
      if (job.status === "processing") {
        current.active = {
          ...active,
          state: "building",
          ...(job.startedAt
            ? { startedAt: new Date(job.startedAt).toISOString() }
            : {}),
        };
        changed = true;
        continue;
      }

      const completedAt = new Date(
        job.completedAt ?? job.startedAt ?? job.createdAt,
      ).toISOString();
      if (job.status === "failed") {
        this.applyFailure(
          state,
          environment,
          active.jobId,
          completedAt,
          job.lastError ?? "Site build failed",
        );
        changed = true;
        continue;
      }

      const result = terminalJobResultSchema.safeParse(job.result);
      if (result.success && result.data.cancelled) {
        this.applyCancellation(
          state,
          environment,
          active.jobId,
          completedAt,
          result.data.errors?.join("; ") ?? "Site build cancelled",
        );
      } else if (result.success && result.data.success) {
        this.applySuccess(
          state,
          environment,
          active.jobId,
          completedAt,
          result.data.routesBuilt,
          result.data.warnings ?? [],
        );
      } else {
        const message = result.success
          ? (result.data.errors?.join("; ") ?? "Site build failed")
          : "Site build completed without a readable result";
        this.applyFailure(
          state,
          environment,
          active.jobId,
          completedAt,
          message,
        );
      }
      changed = true;
    }

    if (changed) await this.persist(state);
  }

  markRequested(
    environment: SiteBuildEnvironment,
    requestedAt: string = new Date().toISOString(),
  ): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      const active = state[environment].active;
      if (active?.state === "queued" || active?.state === "building") return;
      state[environment].active = {
        state: "debouncing",
        requestedAt,
      };
    });
  }

  markQueued(environment: SiteBuildEnvironment, jobId: string): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      const existing = state[environment].active;
      state[environment].active = {
        jobId,
        state: "queued",
        requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      };
    });
  }

  markBuilding(
    environment: SiteBuildEnvironment,
    jobId: string,
    startedAt: string = new Date().toISOString(),
  ): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      const existing = state[environment].active;
      state[environment].active = {
        jobId,
        state: "building",
        requestedAt: existing?.requestedAt ?? startedAt,
        startedAt,
      };
    });
  }

  markSuccess(
    environment: SiteBuildEnvironment,
    jobId: string,
    routesBuilt: number,
    warnings: string[],
    completedAt: string = new Date().toISOString(),
  ): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      this.applySuccess(
        state,
        environment,
        jobId,
        completedAt,
        routesBuilt,
        warnings,
      );
    });
  }

  markCancelled(
    environment: SiteBuildEnvironment,
    jobId: string,
    message: string,
    completedAt: string = new Date().toISOString(),
  ): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      this.applyCancellation(state, environment, jobId, completedAt, message);
    });
  }

  markFailure(
    environment: SiteBuildEnvironment,
    jobId: string,
    message: string,
    completedAt: string = new Date().toISOString(),
  ): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      this.applyFailure(state, environment, jobId, completedAt, message);
    });
  }

  clearActive(environment: SiteBuildEnvironment): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      delete state[environment].active;
    });
  }

  async getSnapshot(): Promise<SiteBuildStatusSnapshot> {
    await this.writeQueue;
    const state = await this.load();
    return {
      environments: [
        { environment: "preview", ...state.preview },
        { environment: "production", ...state.production },
      ],
      recentBuilds: [...state.recentBuilds],
    };
  }

  private load(): Promise<StoredSiteBuildStatus> {
    this.statePromise ??= this.store
      .get(STATUS_KEY)
      .then((stored) => stored ?? structuredClone(EMPTY_STATUS));
    return this.statePromise;
  }

  private mutate(
    mutation: (state: StoredSiteBuildStatus) => void,
  ): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const state = await this.load();
      mutation(state);
      await this.persist(state);
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async persist(state: StoredSiteBuildStatus): Promise<void> {
    const validated = storedSiteBuildStatusSchema.parse(state);
    await this.store.set(STATUS_KEY, validated);
  }

  private applySuccess(
    state: StoredSiteBuildStatus,
    environment: SiteBuildEnvironment,
    jobId: string,
    completedAt: string,
    routesBuilt: number,
    warnings: string[],
  ): void {
    const success: SiteBuildSuccess = {
      jobId,
      completedAt,
      routesBuilt,
      warnings,
    };
    state[environment].lastSuccess = success;
    delete state[environment].lastFailure;
    delete state[environment].lastCancellation;
    this.clearMatchingActive(state, environment, jobId);
    this.prependRecent(state, {
      jobId,
      environment,
      outcome: "succeeded",
      completedAt,
      routesBuilt,
      warnings,
    });
  }

  private applyFailure(
    state: StoredSiteBuildStatus,
    environment: SiteBuildEnvironment,
    jobId: string,
    completedAt: string,
    message: string,
  ): void {
    const failure: SiteBuildFailure = { jobId, completedAt, message };
    state[environment].lastFailure = failure;
    delete state[environment].lastCancellation;
    this.clearMatchingActive(state, environment, jobId);
    this.prependRecent(state, {
      jobId,
      environment,
      outcome: "failed",
      completedAt,
      message,
    });
  }

  private applyCancellation(
    state: StoredSiteBuildStatus,
    environment: SiteBuildEnvironment,
    jobId: string,
    completedAt: string,
    message: string,
  ): void {
    state[environment].lastCancellation = { jobId, completedAt, message };
    delete state[environment].lastFailure;
    this.clearMatchingActive(state, environment, jobId);
    this.prependRecent(state, {
      jobId,
      environment,
      outcome: "cancelled",
      completedAt,
      message,
    });
  }

  private clearMatchingActive(
    state: StoredSiteBuildStatus,
    environment: SiteBuildEnvironment,
    jobId: string,
  ): void {
    if (state[environment].active?.jobId === jobId) {
      delete state[environment].active;
    }
  }

  private prependRecent(
    state: StoredSiteBuildStatus,
    build: RecentSiteBuild,
  ): void {
    state.recentBuilds = [
      build,
      ...state.recentBuilds.filter((entry) => entry.jobId !== build.jobId),
    ].slice(0, 5);
  }
}
