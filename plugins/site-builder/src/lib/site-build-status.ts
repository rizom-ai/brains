import { SerializedStatusStore } from "@brains/plugins";
import type {
  IRuntimeStateNamespace,
  JobInfo,
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
  outcome: "succeeded" | "failed" | "cancelled" | "skipped";
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
  outcome: z.enum(["succeeded", "failed", "cancelled", "skipped"]),
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
  skipped: z.boolean().optional(),
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
const SITE_BUILD_JOB_TYPES = ["site-builder:site-build"];
const RECENT_JOB_SCAN_LIMIT = 10;

const jobEnvironmentSchema = z.object({
  environment: z.enum(["preview", "production"]),
});

/**
 * Persists a bounded, browser-safe projection of site-build jobs.
 * The job queue remains the execution authority; this service adds site-domain meaning.
 */
export class SiteBuildStatusService {
  private readonly store: SerializedStatusStore<StoredSiteBuildStatus>;
  private readonly jobs: Pick<
    ServicePluginContext["jobs"],
    "getStatus" | "getRecentJobs"
  >;

  constructor(
    runtimeState: IRuntimeStateNamespace,
    jobs: Pick<ServicePluginContext["jobs"], "getStatus" | "getRecentJobs">,
  ) {
    this.store = new SerializedStatusStore({
      runtimeState,
      namespace: STATUS_NAMESPACE,
      key: STATUS_KEY,
      schema: storedSiteBuildStatusSchema,
      createEmpty: (): StoredSiteBuildStatus => structuredClone(EMPTY_STATUS),
    });
    this.jobs = jobs;
  }

  async initialize(): Promise<void> {
    // Reconciling against the job queue is a read-modify-write like any other,
    // so it runs inside the queue rather than racing mutations alongside it.
    await this.store.mutate((state) => this.reconcile(state, true));
  }

  private async reconcile(
    state: StoredSiteBuildStatus,
    clearStaleDebounce: boolean = false,
  ): Promise<void> {
    const environments: SiteBuildEnvironment[] = ["preview", "production"];
    for (const environment of environments) {
      const current = state[environment];
      const active = current.active;
      if (!active) continue;
      if (!active.jobId) {
        // A debounced request without a job only survives inside the process
        // that owns its timer; after a restart nothing can ever queue it.
        if (clearStaleDebounce) delete current.active;
        continue;
      }

      const job = await this.jobs.getStatus(active.jobId);
      if (!job) {
        // The queue no longer knows this job; keeping the entry would freeze
        // the UI on a phantom build until the next restart.
        delete current.active;
        continue;
      }

      if (job.status === "pending") {
        current.active = { ...active, state: "queued" };
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
        continue;
      }

      this.applyTerminalJob(state, environment, job);
    }

    await this.reconcileFromQueue(state);
  }

  /**
   * Backstop for lost lifecycle writes: even when no active entry was ever
   * recorded, fold the queue's newest site-build job per environment into the
   * projection — restoring in-flight builds and applying unseen terminal ones.
   */
  private async reconcileFromQueue(
    state: StoredSiteBuildStatus,
  ): Promise<void> {
    const recent = await this.jobs.getRecentJobs(
      SITE_BUILD_JOB_TYPES,
      RECENT_JOB_SCAN_LIMIT,
    );
    const environments: SiteBuildEnvironment[] = ["preview", "production"];
    for (const environment of environments) {
      const latest = recent.find(
        (job) => this.jobEnvironment(job) === environment,
      );
      if (!latest) continue;

      if (latest.status === "pending" || latest.status === "processing") {
        state[environment].active ??= {
          jobId: latest.id,
          state: latest.status === "processing" ? "building" : "queued",
          requestedAt: new Date(latest.createdAt).toISOString(),
          ...(latest.startedAt
            ? { startedAt: new Date(latest.startedAt).toISOString() }
            : {}),
        };
        continue;
      }

      if (state.recentBuilds.some((entry) => entry.jobId === latest.id)) {
        continue;
      }
      const completedAt =
        latest.completedAt ?? latest.startedAt ?? latest.createdAt;
      if (this.hasNewerRecordedOutcome(state[environment], completedAt)) {
        continue;
      }
      this.applyTerminalJob(state, environment, latest);
    }
  }

  private jobEnvironment(job: JobInfo): SiteBuildEnvironment | undefined {
    const fromResult = jobEnvironmentSchema.safeParse(job.result);
    if (fromResult.success) return fromResult.data.environment;
    try {
      const fromData = jobEnvironmentSchema.safeParse(JSON.parse(job.data));
      return fromData.success ? fromData.data.environment : undefined;
    } catch {
      return undefined;
    }
  }

  private hasNewerRecordedOutcome(
    status: Omit<SiteBuildEnvironmentStatus, "environment">,
    completedAt: number,
  ): boolean {
    return [
      status.lastSuccess,
      status.lastFailure,
      status.lastCancellation,
    ].some(
      (outcome) =>
        outcome !== undefined && Date.parse(outcome.completedAt) >= completedAt,
    );
  }

  private applyTerminalJob(
    state: StoredSiteBuildStatus,
    environment: SiteBuildEnvironment,
    job: JobInfo,
  ): void {
    const completedAt = new Date(
      job.completedAt ?? job.startedAt ?? job.createdAt,
    ).toISOString();
    if (job.status === "failed") {
      this.applyFailure(
        state,
        environment,
        job.id,
        completedAt,
        job.lastError ?? "Site build failed",
      );
      return;
    }

    const result = terminalJobResultSchema.safeParse(job.result);
    if (result.success && result.data.cancelled) {
      this.applyCancellation(
        state,
        environment,
        job.id,
        completedAt,
        result.data.errors?.join("; ") ?? "Site build cancelled",
      );
    } else if (result.success && result.data.success && result.data.skipped) {
      this.applySkipped(
        state,
        environment,
        job.id,
        completedAt,
        result.data.routesBuilt,
      );
    } else if (result.success && result.data.success) {
      this.applySuccess(
        state,
        environment,
        job.id,
        completedAt,
        result.data.routesBuilt,
        result.data.warnings ?? [],
      );
    } else {
      const message = result.success
        ? (result.data.errors?.join("; ") ?? "Site build failed")
        : "Site build completed without a readable result";
      this.applyFailure(state, environment, job.id, completedAt, message);
    }
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

  markSkipped(
    environment: SiteBuildEnvironment,
    jobId: string,
    routesBuilt: number,
    completedAt: string = new Date().toISOString(),
  ): Promise<void> {
    return this.mutate((state: StoredSiteBuildStatus) => {
      this.applySkipped(state, environment, jobId, completedAt, routesBuilt);
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
    await this.store.mutate((state) => this.reconcile(state));
    const state = await this.store.snapshot();
    return {
      environments: [
        { environment: "preview", ...state.preview },
        { environment: "production", ...state.production },
      ],
      recentBuilds: state.recentBuilds,
    };
  }

  private mutate(
    mutation: (state: StoredSiteBuildStatus) => void,
  ): Promise<void> {
    return this.store.mutate(mutation);
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

  private applySkipped(
    state: StoredSiteBuildStatus,
    environment: SiteBuildEnvironment,
    jobId: string,
    completedAt: string,
    routesBuilt: number,
  ): void {
    this.clearMatchingActive(state, environment, jobId);
    this.prependRecent(state, {
      jobId,
      environment,
      outcome: "skipped",
      completedAt,
      routesBuilt,
      message: "Site inputs were unchanged; no render was published",
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
