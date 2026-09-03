import {
  createId,
  SerializedStatusStore,
  type IRuntimeStateNamespace,
  type IRuntimeStateStore,
  type RuntimeHealthCheck,
  type ServicePluginContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { isAbsolute, relative } from "path";
import type { ExportResult, ImportResult } from "../types";
import { DEFAULT_GIT_TIMEOUT_MS } from "./git-options";

const runSourceSchema: z.ZodEnum<{
  manual: "manual";
  periodic: "periodic";
  watcher: "watcher";
  save: "save";
}> = z.enum(["manual", "periodic", "watcher", "save"]);
export type DirectorySyncRunSource = z.output<typeof runSourceSchema>;

const runStateSchema: z.ZodEnum<{
  pulling: "pulling";
  scanning: "scanning";
  importing: "importing";
  settling: "settling";
}> = z.enum(["pulling", "scanning", "importing", "settling"]);
export type DirectorySyncRunState = z.output<typeof runStateSchema>;

const runOutcomeSchema: z.ZodEnum<{
  succeeded: "succeeded";
  attention: "attention";
  failed: "failed";
}> = z.enum(["succeeded", "attention", "failed"]);
export type DirectorySyncRunOutcome = z.output<typeof runOutcomeSchema>;

const issueKindSchema: z.ZodEnum<{
  quarantined: "quarantined";
  import: "import";
  export: "export";
  git: "git";
  source: "source";
}> = z.enum(["quarantined", "import", "export", "git", "source"]);
export type DirectorySyncIssueKind = z.output<typeof issueKindSchema>;

type RunMetricsSchema = z.ZodObject<{
  imported: z.ZodNumber;
  skipped: z.ZodNumber;
  failed: z.ZodNumber;
  quarantined: z.ZodNumber;
  exported: z.ZodNumber;
}>;
const runMetricsSchema: RunMetricsSchema = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  exported: z.number().int().nonnegative(),
});
export type DirectorySyncRunMetrics = z.output<typeof runMetricsSchema>;

type ActiveRunSchema = z.ZodObject<
  RunMetricsSchema["shape"] & {
    id: z.ZodString;
    source: typeof runSourceSchema;
    state: typeof runStateSchema;
    startedAt: z.ZodString;
    lastProgressAt: z.ZodString;
    jobId: z.ZodOptional<z.ZodString>;
    batchId: z.ZodOptional<z.ZodString>;
  }
>;
/** Runs recorded before lastProgressAt existed read as progressing at their start. */
export const activeDirectorySyncRunSchema: z.ZodPreprocess<ActiveRunSchema> =
  z.preprocess(
    (input) => {
      if (
        typeof input !== "object" ||
        input === null ||
        "lastProgressAt" in input ||
        !("startedAt" in input) ||
        typeof input.startedAt !== "string"
      ) {
        return input;
      }
      return { ...input, lastProgressAt: input.startedAt };
    },
    z.object({
      id: z.string().min(1),
      source: runSourceSchema,
      state: runStateSchema,
      startedAt: z.string().datetime(),
      lastProgressAt: z.string().datetime(),
      jobId: z.string().min(1).optional(),
      batchId: z.string().min(1).optional(),
      ...runMetricsSchema.shape,
    }),
  );
export type ActiveDirectorySyncRun = z.output<
  typeof activeDirectorySyncRunSchema
>;

export const recentDirectorySyncRunSchema: z.ZodObject<
  RunMetricsSchema["shape"] & {
    id: z.ZodString;
    source: typeof runSourceSchema;
    outcome: typeof runOutcomeSchema;
    startedAt: z.ZodString;
    completedAt: z.ZodString;
    summary: z.ZodString;
  }
> = z.object({
  id: z.string().min(1),
  source: runSourceSchema,
  outcome: runOutcomeSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  summary: z.string().min(1).max(240),
  ...runMetricsSchema.shape,
});
export type RecentDirectorySyncRun = z.output<
  typeof recentDirectorySyncRunSchema
>;

export const directorySyncIssueSchema: z.ZodObject<{
  id: z.ZodString;
  kind: typeof issueKindSchema;
  path: z.ZodOptional<z.ZodString>;
  message: z.ZodString;
  occurredAt: z.ZodString;
}> = z.object({
  id: z.string().min(1),
  kind: issueKindSchema,
  path: z.string().min(1).max(300).optional(),
  message: z.string().min(1).max(400),
  occurredAt: z.string().datetime(),
});
export type DirectorySyncIssue = z.output<typeof directorySyncIssueSchema>;

const storedStatusSchema: z.ZodObject<{
  activeRun: z.ZodOptional<typeof activeDirectorySyncRunSchema>;
  recentRuns: z.ZodArray<typeof recentDirectorySyncRunSchema>;
  issues: z.ZodArray<typeof directorySyncIssueSchema>;
}> = z.object({
  activeRun: activeDirectorySyncRunSchema.optional(),
  recentRuns: z.array(recentDirectorySyncRunSchema).max(5),
  issues: z.array(directorySyncIssueSchema).max(8),
});
export type DirectorySyncOperationSnapshot = z.output<
  typeof storedStatusSchema
>;

const syncRequestResultSchema = z.object({
  gitPulled: z.literal(true),
  batchQueued: z.boolean(),
  batchId: z.string().optional(),
  importOperations: z.number().int().nonnegative().optional(),
  totalFiles: z.number().int().nonnegative().optional(),
});

const EMPTY_METRICS: DirectorySyncRunMetrics = {
  imported: 0,
  skipped: 0,
  failed: 0,
  quarantined: 0,
  exported: 0,
};
const EMPTY_STATUS: DirectorySyncOperationSnapshot = {
  recentRuns: [],
  issues: [],
};
const progressSchema = z.object({
  lastProgressAt: z.string().datetime(),
});

const STATUS_NAMESPACE = "directory-sync.operation-status";
const STATUS_KEY = "current";
const PROGRESS_NAMESPACE = "directory-sync.operation-progress";
const DEFAULT_PROGRESS_PERSISTENCE_INTERVAL_MS = 1_000;
const DEFAULT_STALE_GRACE_MS = 30_000;

export interface DirectorySyncOperationStatusOptions {
  now?: (() => number) | undefined;
  inactivityTimeoutMs?: number | undefined;
  staleGraceMs?: number | undefined;
  progressPersistenceIntervalMs?: number | undefined;
}

/**
 * Bounded, browser-safe operational history for directory-sync.
 * Jobs and batches remain execution authority; this service gives them sync-domain meaning.
 */
export class DirectorySyncOperationStatusService {
  private readonly store: SerializedStatusStore<DirectorySyncOperationSnapshot>;
  private readonly progressStore: IRuntimeStateStore<
    z.infer<typeof progressSchema>
  >;
  private readonly jobs: Pick<
    ServicePluginContext["jobs"],
    "getStatus" | "getBatchStatus"
  >;
  private readonly logger: Logger;
  private readonly now: () => number;
  private readonly inactivityTimeoutMs: number;
  private readonly staleGraceMs: number;
  private readonly progressPersistenceIntervalMs: number;
  private readonly lastProgressPersistence = new Map<string, number>();
  private syncPath: string;

  constructor(
    runtimeState: IRuntimeStateNamespace,
    jobs: ServicePluginContext["jobs"],
    logger: Logger,
    syncPath: string,
    options: DirectorySyncOperationStatusOptions = {},
  ) {
    this.store = new SerializedStatusStore({
      runtimeState,
      namespace: STATUS_NAMESPACE,
      key: STATUS_KEY,
      schema: storedStatusSchema,
      createEmpty: (): DirectorySyncOperationSnapshot =>
        structuredClone(EMPTY_STATUS),
    });
    this.progressStore = runtimeState.scoped({
      namespace: PROGRESS_NAMESPACE,
      schema: progressSchema,
    });
    this.jobs = jobs;
    this.logger = logger;
    this.syncPath = syncPath;
    this.now = options.now ?? Date.now;
    this.inactivityTimeoutMs =
      options.inactivityTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    this.staleGraceMs = options.staleGraceMs ?? DEFAULT_STALE_GRACE_MS;
    this.progressPersistenceIntervalMs =
      options.progressPersistenceIntervalMs ??
      DEFAULT_PROGRESS_PERSISTENCE_INTERVAL_MS;
  }

  setSyncPath(syncPath: string): void {
    this.syncPath = syncPath;
  }

  async initialize(): Promise<ActiveDirectorySyncRun | undefined> {
    const status = await this.store.snapshot();
    if (
      status.activeRun &&
      !status.activeRun.jobId &&
      !status.activeRun.batchId
    ) {
      if (status.activeRun.state === "pulling") {
        return this.withEffectiveProgress(status.activeRun);
      }
      await this.clearRun(status.activeRun.id);
      return undefined;
    }
    await this.reconcile();
    return undefined;
  }

  startRun(
    source: DirectorySyncRunSource,
    state: DirectorySyncRunState,
  ): Promise<string | undefined> {
    const id = createId();
    const now = this.now();
    return this.mutate((status) => {
      if (status.activeRun) return undefined;
      const timestamp = new Date(now).toISOString();
      status.activeRun = {
        id,
        source,
        state,
        startedAt: timestamp,
        lastProgressAt: timestamp,
        ...EMPTY_METRICS,
      };
      this.lastProgressPersistence.set(id, now);
      return id;
    });
  }

  markPhase(runId: string, state: DirectorySyncRunState): Promise<void> {
    const now = this.now();
    return this.mutate((status) => {
      if (status.activeRun?.id !== runId) return;
      status.activeRun.state = state;
      status.activeRun.lastProgressAt = new Date(now).toISOString();
      this.lastProgressPersistence.set(runId, now);
    });
  }

  async markProgress(runId: string): Promise<void> {
    const now = this.now();
    const lastPersisted = this.lastProgressPersistence.get(runId);
    if (
      lastPersisted !== undefined &&
      now - lastPersisted < this.progressPersistenceIntervalMs
    ) {
      return;
    }
    this.lastProgressPersistence.set(runId, now);
    await this.progressStore.set(runId, {
      lastProgressAt: new Date(now).toISOString(),
    });
  }

  createProgressObserver(runId: string): () => void {
    return (): void => {
      void this.markProgress(runId).catch((error: unknown) => {
        this.logger.debug("Unable to persist directory Git progress", {
          error,
        });
      });
    };
  }

  attachJob(runId: string, jobId: string): Promise<void> {
    const now = this.now();
    return this.mutate((status) => {
      if (status.activeRun?.id !== runId) return;
      status.activeRun.jobId = jobId;
      status.activeRun.state = "pulling";
      status.activeRun.lastProgressAt = new Date(now).toISOString();
      this.lastProgressPersistence.set(runId, now);
    });
  }

  attachBatch(runId: string, batchId: string): Promise<void> {
    const now = this.now();
    return this.mutate((status) => {
      if (status.activeRun?.id !== runId) return;
      delete status.activeRun.jobId;
      status.activeRun.batchId = batchId;
      status.activeRun.state = "importing";
      status.activeRun.lastProgressAt = new Date(now).toISOString();
      this.lastProgressPersistence.set(runId, now);
    });
  }

  addImportResult(result: ImportResult): Promise<void> {
    const now = this.now();
    return this.mutate((status) => {
      if (status.activeRun) {
        status.activeRun.imported += result.imported;
        status.activeRun.skipped += result.skipped;
        status.activeRun.failed += result.failed;
        status.activeRun.quarantined += result.quarantined;
        status.activeRun.lastProgressAt = new Date(now).toISOString();
        this.lastProgressPersistence.set(status.activeRun.id, now);
      }

      const issueInputs: Array<{
        kind: DirectorySyncIssueKind;
        path?: string;
        message: string;
      }> = [
        ...(result.issues ?? []).map((issue) => ({
          kind: "import" as const,
          path: this.safePath(issue.path),
          message: issue.message,
        })),
        ...result.errors.map((error) => ({
          kind: "import" as const,
          path: this.safePath(error.path),
          message: error.error,
        })),
        ...result.quarantinedFiles.map((path) => ({
          kind: "quarantined" as const,
          path: this.safePath(path),
          message: "File was quarantined because it could not be imported",
        })),
      ];

      if (issueInputs.length === 0) {
        status.issues = status.issues.filter(
          (issue) => issue.kind !== "import" && issue.kind !== "quarantined",
        );
      } else {
        for (const issue of issueInputs) this.prependIssue(status, issue);
      }
    });
  }

  addExportResult(result: ExportResult): Promise<void> {
    const now = this.now();
    return this.mutate((status) => {
      if (status.activeRun) {
        status.activeRun.exported += result.exported;
        status.activeRun.failed += result.failed;
        status.activeRun.lastProgressAt = new Date(now).toISOString();
        this.lastProgressPersistence.set(status.activeRun.id, now);
      }
      if (result.errors.length === 0) {
        status.issues = status.issues.filter(
          (issue) => issue.kind !== "export",
        );
        return;
      }
      for (const error of result.errors) {
        this.prependIssue(status, {
          kind: "export",
          path: `${error.entityType}/${error.entityId}.md`,
          message: error.error,
        });
      }
    });
  }

  recordIssue(input: {
    kind: DirectorySyncIssueKind;
    path?: string | undefined;
    message: string;
  }): Promise<void> {
    return this.mutate((status) => this.prependIssue(status, input));
  }

  clearIssues(kinds: DirectorySyncIssueKind[]): Promise<void> {
    return this.mutate((status) => {
      status.issues = status.issues.filter(
        (issue) => !kinds.includes(issue.kind),
      );
    });
  }

  completeRun(runId: string, summary: string): Promise<void> {
    return this.finishRun(runId, "succeeded", summary);
  }

  async clearRun(runId: string): Promise<void> {
    await this.mutate((status) => {
      if (status.activeRun?.id === runId) delete status.activeRun;
    });
    await this.clearProgress(runId);
  }

  async failRun(
    runId: string,
    message: string,
    kind: DirectorySyncIssueKind = "git",
  ): Promise<void> {
    await this.mutate((status) => {
      const active = status.activeRun;
      if (active?.id !== runId) return;
      const safeMessage = sanitizeMessage(message);
      this.prependRecent(status, active, "failed", safeMessage);
      this.prependIssue(status, { kind, message: safeMessage });
      delete status.activeRun;
    });
    await this.clearProgress(runId);
  }

  async finishInterruptedPull(
    runId: string,
    recovery: { recovered: boolean; message: string },
  ): Promise<void> {
    await this.mutate((status) => {
      const active = status.activeRun;
      if (active?.id !== runId || active.state !== "pulling") return;
      const safeMessage = sanitizeMessage(recovery.message);
      this.prependRecent(
        status,
        active,
        recovery.recovered ? "attention" : "failed",
        safeMessage,
      );
      this.prependIssue(status, { kind: "git", message: safeMessage });
      delete status.activeRun;
    });
    await this.clearProgress(runId);
  }

  recordTerminal(
    source: DirectorySyncRunSource,
    outcome: DirectorySyncRunOutcome,
    summary: string,
    metrics: Partial<DirectorySyncRunMetrics> = {},
  ): Promise<void> {
    return this.mutate((status) => {
      const now = new Date(this.now()).toISOString();
      this.prependRecent(
        status,
        {
          id: createId(),
          source,
          state: "settling",
          startedAt: now,
          lastProgressAt: now,
          ...EMPTY_METRICS,
          ...metrics,
        },
        outcome,
        summary,
      );
    });
  }

  async reconcile(): Promise<void> {
    const status = await this.store.snapshot();
    const active = status.activeRun;
    if (!active) return;

    try {
      if (active.jobId) {
        const job = await this.jobs.getStatus(active.jobId);
        if (!job) {
          await this.failRun(
            active.id,
            "The active sync job could not be found after restart",
            "source",
          );
          return;
        }
        if (job.status === "pending" || job.status === "processing") {
          return;
        }
        if (job.status === "failed") {
          await this.failRun(
            active.id,
            job.lastError ?? "Git-backed sync failed",
          );
          return;
        }

        const result = syncRequestResultSchema.safeParse(
          parseStoredJobResult(job.result),
        );
        if (!result.success) {
          await this.failRun(
            active.id,
            "Sync job completed without a readable result",
            "source",
          );
          return;
        }
        if (result.data.batchQueued && result.data.batchId) {
          await this.attachBatch(active.id, result.data.batchId);
          return await this.reconcile();
        }
        await this.completeRun(active.id, "Remote checked; no files to import");
        return;
      }

      if (active.batchId) {
        const batch = await this.jobs.getBatchStatus(active.batchId);
        if (!batch) {
          await this.failRun(
            active.id,
            "The active sync batch could not be recovered after restart",
            "source",
          );
          return;
        }
        if (batch.status === "pending" || batch.status === "processing") {
          return;
        }
        if (batch.status === "failed") {
          await this.failRun(
            active.id,
            batch.errors.join("; ") || "Directory import batch failed",
            "import",
          );
          return;
        }
        await this.completeRun(
          active.id,
          `${batch.completedOperations} sync operations completed`,
        );
      }
    } catch (error) {
      this.logger.debug("Unable to reconcile directory sync operation", {
        error,
      });
    }
  }

  async getSnapshot(): Promise<DirectorySyncOperationSnapshot> {
    await this.reconcile();
    const status = await this.store.snapshot();
    if (status.activeRun) {
      status.activeRun = await this.withEffectiveProgress(status.activeRun);
    }
    return status;
  }

  async getOperationalHealth(): Promise<Omit<RuntimeHealthCheck, "name">> {
    const status = await this.store.snapshot();
    if (status.activeRun?.state !== "pulling") {
      return healthyGitProgress();
    }

    const active = await this.withEffectiveProgress(status.activeRun);
    if (active.jobId) {
      const job = await this.jobs.getStatus(active.jobId);
      if (job?.status !== "processing") return healthyGitProgress();
    }
    const inactivityMs = Math.max(
      0,
      this.now() - Date.parse(active.lastProgressAt),
    );
    const staleAfterMs = this.inactivityTimeoutMs + this.staleGraceMs;
    if (inactivityMs <= staleAfterMs) return healthyGitProgress();

    return {
      status: "degraded",
      message: `Directory Git pull has made no progress for ${inactivityMs}ms`,
      details: {
        runId: active.id,
        source: active.source,
        state: active.state,
        lastProgressAt: active.lastProgressAt,
        inactivityMs,
        staleAfterMs,
      },
    };
  }

  private async finishRun(
    runId: string,
    outcome: DirectorySyncRunOutcome,
    summary: string,
  ): Promise<void> {
    await this.mutate((status) => {
      const active = status.activeRun;
      if (active?.id !== runId) return;
      const derivedOutcome =
        active.failed > 0 || active.quarantined > 0 ? "attention" : outcome;
      this.prependRecent(status, active, derivedOutcome, summary);
      delete status.activeRun;
      if (derivedOutcome === "succeeded") {
        status.issues = status.issues.filter(
          (issue) => issue.kind !== "git" && issue.kind !== "source",
        );
      }
    });
    await this.clearProgress(runId);
  }

  private mutate<T>(
    mutation: (status: DirectorySyncOperationSnapshot) => T,
  ): Promise<T> {
    return this.store.mutate(mutation);
  }

  private prependRecent(
    status: DirectorySyncOperationSnapshot,
    active: ActiveDirectorySyncRun,
    outcome: DirectorySyncRunOutcome,
    summary: string,
  ): void {
    const recent: RecentDirectorySyncRun = {
      id: active.id,
      source: active.source,
      outcome,
      startedAt: active.startedAt,
      completedAt: new Date(this.now()).toISOString(),
      summary: sanitizeMessage(summary, 240),
      imported: active.imported,
      skipped: active.skipped,
      failed: active.failed,
      quarantined: active.quarantined,
      exported: active.exported,
    };
    status.recentRuns = [
      recent,
      ...status.recentRuns.filter((run) => run.id !== recent.id),
    ].slice(0, 5);
  }

  private prependIssue(
    status: DirectorySyncOperationSnapshot,
    input: {
      kind: DirectorySyncIssueKind;
      path?: string | undefined;
      message: string;
    },
  ): void {
    const safePath = input.path ? this.safePath(input.path) : undefined;
    const issue: DirectorySyncIssue = {
      id: `${input.kind}:${safePath ?? sanitizeMessage(input.message, 80)}`,
      kind: input.kind,
      ...(safePath ? { path: safePath } : {}),
      message: sanitizeMessage(input.message),
      occurredAt: new Date(this.now()).toISOString(),
    };
    status.issues = [
      issue,
      ...status.issues.filter((candidate) => candidate.id !== issue.id),
    ].slice(0, 8);
  }

  private async withEffectiveProgress(
    active: ActiveDirectorySyncRun,
  ): Promise<ActiveDirectorySyncRun> {
    const progress = await this.progressStore.get(active.id);
    if (
      !progress ||
      Date.parse(progress.lastProgressAt) <= Date.parse(active.lastProgressAt)
    ) {
      return active;
    }
    return { ...active, lastProgressAt: progress.lastProgressAt };
  }

  private async clearProgress(runId: string): Promise<void> {
    this.lastProgressPersistence.delete(runId);
    await this.progressStore.delete(runId);
  }

  private safePath(path: string): string {
    if (!isAbsolute(path)) return normalizeRelativePath(path);
    const candidate = relative(this.syncPath, path);
    if (candidate.startsWith("..") || isAbsolute(candidate))
      return "content file";
    return normalizeRelativePath(candidate);
  }
}

function healthyGitProgress(): Omit<RuntimeHealthCheck, "name"> {
  return { status: "healthy", message: "No stale directory Git pull" };
}

function parseStoredJobResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    const parsed: unknown = JSON.parse(result);
    return parsed;
  } catch {
    return result;
  }
}

function normalizeRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized.slice(0, 300) || "content file";
}

function sanitizeMessage(message: string, maxLength = 400): string {
  return (
    message
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
      .replace(/(token|password|authorization)=([^\s&]+)/gi, "$1=[redacted]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength) || "Directory sync operation failed"
  );
}
