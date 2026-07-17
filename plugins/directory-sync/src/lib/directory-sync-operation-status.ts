import {
  createId,
  type IRuntimeStateNamespace,
  type IRuntimeStateStore,
  type ServicePluginContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { isAbsolute, relative } from "path";
import type { ExportResult, ImportResult } from "../types";

export type DirectorySyncRunSource = "manual" | "periodic" | "watcher" | "save";
export type DirectorySyncRunState =
  "pulling" | "scanning" | "importing" | "settling";
export type DirectorySyncRunOutcome = "succeeded" | "attention" | "failed";
export type DirectorySyncIssueKind =
  "quarantined" | "import" | "export" | "git" | "source";

export interface DirectorySyncRunMetrics {
  imported: number;
  skipped: number;
  failed: number;
  quarantined: number;
  exported: number;
}

export interface ActiveDirectorySyncRun extends DirectorySyncRunMetrics {
  id: string;
  source: DirectorySyncRunSource;
  state: DirectorySyncRunState;
  startedAt: string;
  jobId?: string | undefined;
  batchId?: string | undefined;
}

export interface RecentDirectorySyncRun extends DirectorySyncRunMetrics {
  id: string;
  source: DirectorySyncRunSource;
  outcome: DirectorySyncRunOutcome;
  startedAt: string;
  completedAt: string;
  summary: string;
}

export interface DirectorySyncIssue {
  id: string;
  kind: DirectorySyncIssueKind;
  path?: string | undefined;
  message: string;
  occurredAt: string;
}

interface StoredDirectorySyncOperationStatus {
  activeRun?: ActiveDirectorySyncRun | undefined;
  recentRuns: RecentDirectorySyncRun[];
  issues: DirectorySyncIssue[];
}

export interface DirectorySyncOperationSnapshot {
  activeRun?: ActiveDirectorySyncRun | undefined;
  recentRuns: RecentDirectorySyncRun[];
  issues: DirectorySyncIssue[];
}

const runSourceSchema = z.enum(["manual", "periodic", "watcher", "save"]);
const runStateSchema = z.enum(["pulling", "scanning", "importing", "settling"]);
const runMetricsSchema = {
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  exported: z.number().int().nonnegative(),
};
const activeRunSchema = z.object({
  id: z.string().min(1),
  source: runSourceSchema,
  state: runStateSchema,
  startedAt: z.string().datetime(),
  jobId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  ...runMetricsSchema,
});
const recentRunSchema = z.object({
  id: z.string().min(1),
  source: runSourceSchema,
  outcome: z.enum(["succeeded", "attention", "failed"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  summary: z.string().min(1).max(240),
  ...runMetricsSchema,
});
const issueSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["quarantined", "import", "export", "git", "source"]),
  path: z.string().min(1).max(300).optional(),
  message: z.string().min(1).max(400),
  occurredAt: z.string().datetime(),
});
const storedStatusSchema: z.ZodType<StoredDirectorySyncOperationStatus> =
  z.object({
    activeRun: activeRunSchema.optional(),
    recentRuns: z.array(recentRunSchema).max(5),
    issues: z.array(issueSchema).max(8),
  });

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
const EMPTY_STATUS: StoredDirectorySyncOperationStatus = {
  recentRuns: [],
  issues: [],
};
const STATUS_NAMESPACE = "directory-sync.operation-status";
const STATUS_KEY = "current";

/**
 * Bounded, browser-safe operational history for directory-sync.
 * Jobs and batches remain execution authority; this service gives them sync-domain meaning.
 */
export class DirectorySyncOperationStatusService {
  private readonly store: IRuntimeStateStore<StoredDirectorySyncOperationStatus>;
  private readonly jobs: Pick<
    ServicePluginContext["jobs"],
    "getStatus" | "getBatchStatus"
  >;
  private readonly logger: Logger;
  private syncPath: string;
  private statePromise: Promise<StoredDirectorySyncOperationStatus> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    runtimeState: IRuntimeStateNamespace,
    jobs: ServicePluginContext["jobs"],
    logger: Logger,
    syncPath: string,
  ) {
    this.store = runtimeState.scoped({
      namespace: STATUS_NAMESPACE,
      schema: storedStatusSchema,
    });
    this.jobs = jobs;
    this.logger = logger;
    this.syncPath = syncPath;
  }

  setSyncPath(syncPath: string): void {
    this.syncPath = syncPath;
  }

  async initialize(): Promise<void> {
    const status = await this.load();
    if (
      status.activeRun &&
      !status.activeRun.jobId &&
      !status.activeRun.batchId
    ) {
      await this.clearRun(status.activeRun.id);
      return;
    }
    await this.reconcile();
  }

  startRun(
    source: DirectorySyncRunSource,
    state: DirectorySyncRunState,
  ): Promise<string | undefined> {
    const id = createId();
    return this.mutate((status) => {
      if (status.activeRun) return undefined;
      status.activeRun = {
        id,
        source,
        state,
        startedAt: new Date().toISOString(),
        ...EMPTY_METRICS,
      };
      return id;
    });
  }

  markPhase(runId: string, state: DirectorySyncRunState): Promise<void> {
    return this.mutate((status) => {
      if (status.activeRun?.id === runId) status.activeRun.state = state;
    });
  }

  attachJob(runId: string, jobId: string): Promise<void> {
    return this.mutate((status) => {
      if (status.activeRun?.id !== runId) return;
      status.activeRun.jobId = jobId;
      status.activeRun.state = "pulling";
    });
  }

  attachBatch(runId: string, batchId: string): Promise<void> {
    return this.mutate((status) => {
      if (status.activeRun?.id !== runId) return;
      delete status.activeRun.jobId;
      status.activeRun.batchId = batchId;
      status.activeRun.state = "importing";
    });
  }

  addImportResult(result: ImportResult): Promise<void> {
    return this.mutate((status) => {
      if (status.activeRun) {
        status.activeRun.imported += result.imported;
        status.activeRun.skipped += result.skipped;
        status.activeRun.failed += result.failed;
        status.activeRun.quarantined += result.quarantined;
      }

      const issueInputs: Array<{
        kind: DirectorySyncIssueKind;
        path?: string;
        message: string;
      }> = [
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
    return this.mutate((status) => {
      if (status.activeRun) {
        status.activeRun.exported += result.exported;
        status.activeRun.failed += result.failed;
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

  clearRun(runId: string): Promise<void> {
    return this.mutate((status) => {
      if (status.activeRun?.id === runId) delete status.activeRun;
    });
  }

  failRun(
    runId: string,
    message: string,
    kind: DirectorySyncIssueKind = "git",
  ): Promise<void> {
    return this.mutate((status) => {
      const active = status.activeRun;
      if (active?.id !== runId) return;
      const safeMessage = sanitizeMessage(message);
      this.prependRecent(status, active, "failed", safeMessage);
      this.prependIssue(status, { kind, message: safeMessage });
      delete status.activeRun;
    });
  }

  recordTerminal(
    source: DirectorySyncRunSource,
    outcome: DirectorySyncRunOutcome,
    summary: string,
    metrics: Partial<DirectorySyncRunMetrics> = {},
  ): Promise<void> {
    return this.mutate((status) => {
      const now = new Date().toISOString();
      this.prependRecent(
        status,
        {
          id: createId(),
          source,
          state: "settling",
          startedAt: now,
          ...EMPTY_METRICS,
          ...metrics,
        },
        outcome,
        summary,
      );
    });
  }

  async reconcile(): Promise<void> {
    await this.writeQueue;
    const status = await this.load();
    const active = status.activeRun ? { ...status.activeRun } : undefined;
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
          await this.markPhase(active.id, "pulling");
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
          await this.markPhase(active.id, "importing");
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
    await this.writeQueue;
    const status = await this.load();
    return structuredClone(status);
  }

  private finishRun(
    runId: string,
    outcome: DirectorySyncRunOutcome,
    summary: string,
  ): Promise<void> {
    return this.mutate((status) => {
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
  }

  private load(): Promise<StoredDirectorySyncOperationStatus> {
    this.statePromise ??= this.store
      .get(STATUS_KEY)
      .then((stored) => stored ?? structuredClone(EMPTY_STATUS));
    return this.statePromise;
  }

  private mutate<T>(
    mutation: (status: StoredDirectorySyncOperationStatus) => T,
  ): Promise<T> {
    const operation = this.writeQueue.then(async () => {
      const status = await this.load();
      const result = mutation(status);
      await this.persist(status);
      return result;
    });
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private persist(status: StoredDirectorySyncOperationStatus): Promise<void> {
    return this.store.set(STATUS_KEY, storedStatusSchema.parse(status));
  }

  private prependRecent(
    status: StoredDirectorySyncOperationStatus,
    active: ActiveDirectorySyncRun,
    outcome: DirectorySyncRunOutcome,
    summary: string,
  ): void {
    const recent: RecentDirectorySyncRun = {
      id: active.id,
      source: active.source,
      outcome,
      startedAt: active.startedAt,
      completedAt: new Date().toISOString(),
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
    status: StoredDirectorySyncOperationStatus,
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
      occurredAt: new Date().toISOString(),
    };
    status.issues = [
      issue,
      ...status.issues.filter((candidate) => candidate.id !== issue.id),
    ].slice(0, 8);
  }

  private safePath(path: string): string {
    if (!isAbsolute(path)) return normalizeRelativePath(path);
    const candidate = relative(this.syncPath, path);
    if (candidate.startsWith("..") || isAbsolute(candidate))
      return "content file";
    return normalizeRelativePath(candidate);
  }
}

function parseStoredJobResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result) as unknown;
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
