import { readdir, readFile } from "node:fs/promises";
import { internalFullScope } from "@brains/entity-service";
import type {
  ProjectionWave,
  ProjectionWaveRule,
} from "@brains/entity-service";
import type { JobInfo, JobQueueDiagnostics } from "@brains/job-queue";
import type {
  DaemonStatusInfo,
  RuntimeHealthCheck,
  RuntimeReadiness,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { ShellServices } from "./types/shell-types";
import type { ProjectionRuntimeDiagnostics } from "./projection-runtime-supervisor";

interface ProcessSignals {
  fileDescriptors: number | null;
  processCount: number | null;
  zombieCount: number | null;
}

interface RuntimeMemoryUsage {
  rss: number;
  heapUsed: number;
  heapTotal: number;
}

interface ProjectionWaveReader {
  getActiveWave(): Promise<ProjectionWave | null>;
  listWaveRules(waveId: string): Promise<ProjectionWaveRule[]>;
}

interface StrandedProjectionRule {
  ruleId: string;
  jobId: string | null;
  jobStatus: JobInfo["status"] | "missing";
}

interface ProjectionWaveDiagnostics {
  waveId: string | null;
  strandedRules: StrandedProjectionRule[];
}

export interface RuntimeReadinessOptions {
  entityService: Pick<ShellServices["entityService"], "getEntityCounts"> & {
    getProjectionStore(): ProjectionWaveReader;
  };
  jobQueueService: Pick<
    ShellServices["jobQueueService"],
    "getDiagnostics" | "getStatus"
  >;
  daemonRegistry: Pick<ShellServices["daemonRegistry"], "getStatuses">;
  operationalHealthRegistry: Pick<
    ShellServices["operationalHealthRegistry"],
    "getChecks"
  >;
  projectionRuntimeSupervisor: Pick<
    ShellServices["projectionRuntimeSupervisor"],
    "getDiagnostics"
  >;
  now?: () => number;
  memoryUsage?: () => RuntimeMemoryUsage;
  readProcessSignals?: () => Promise<ProcessSignals>;
}

async function readLinuxProcessSignals(
  procRoot = "/proc",
): Promise<ProcessSignals> {
  let fileDescriptors: number | null = null;
  try {
    fileDescriptors = (await readdir(`${procRoot}/self/fd`)).length;
  } catch {
    // /proc is Linux-specific; unavailable metrics remain explicit nulls.
  }

  try {
    const entries = await readdir(procRoot, { withFileTypes: true });
    const processIds = entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => entry.name);
    let zombies = 0;
    let readableProcesses = 0;
    await Promise.all(
      processIds.map(async (processId) => {
        try {
          const status = await readFile(
            `${procRoot}/${processId}/status`,
            "utf8",
          );
          readableProcesses++;
          if (/^State:\s+Z\b/m.test(status)) zombies++;
        } catch {
          // A process may exit between directory enumeration and status read.
        }
      }),
    );
    return {
      fileDescriptors,
      processCount: readableProcesses,
      zombieCount: zombies,
    };
  } catch {
    return { fileDescriptors, processCount: null, zombieCount: null };
  }
}

function dependencyCheck(
  name: string,
  result: PromiseSettledResult<unknown>,
  healthyMessage: string,
): RuntimeHealthCheck {
  return result.status === "fulfilled"
    ? { name, status: "healthy", message: healthyMessage }
    : {
        name,
        status: "unhealthy",
        message: getErrorMessage(result.reason),
      };
}

function workerCheck(
  diagnostics: JobQueueDiagnostics | null,
): RuntimeHealthCheck {
  if (!diagnostics) {
    return {
      name: "job-worker",
      status: "degraded",
      message: "Worker session state is unavailable",
    };
  }

  const sessions = diagnostics.workerSessions;
  if (sessions.active === 0) {
    return {
      name: "job-worker",
      status: "degraded",
      message: "No live worker session",
      details: { sessions },
    };
  }
  if (sessions.stale > 0) {
    return {
      name: "job-worker",
      status: "degraded",
      message: `${sessions.stale} stale worker session(s)`,
      details: { sessions },
    };
  }
  return {
    name: "job-worker",
    status: "healthy",
    message: `${sessions.active} live worker session(s)`,
    details: { sessions },
  };
}

function leaseCheck(
  diagnostics: JobQueueDiagnostics | null,
): RuntimeHealthCheck {
  if (!diagnostics) {
    return {
      name: "attempt-leases",
      status: "degraded",
      message: "Lease state is unavailable",
    };
  }
  return diagnostics.staleLeaseCount === 0
    ? {
        name: "attempt-leases",
        status: "healthy",
        message: "No stale processing leases",
      }
    : {
        name: "attempt-leases",
        status: "degraded",
        message: `${diagnostics.staleLeaseCount} processing lease(s) are stale`,
        details: { staleLeaseCount: diagnostics.staleLeaseCount },
      };
}

function projectionCheck(
  diagnostics: ProjectionRuntimeDiagnostics,
): RuntimeHealthCheck {
  if (!diagnostics.initialized) {
    return {
      name: "projection-circuits",
      status: "degraded",
      message: "Projection runtime supervisor is not initialized",
    };
  }
  if (diagnostics.openCircuits.length === 0) {
    return {
      name: "projection-circuits",
      status: "healthy",
      message: "No projection circuits are open",
    };
  }
  return {
    name: "projection-circuits",
    status: "degraded",
    message: `${diagnostics.openCircuits.length} projection circuit(s) open`,
    details: { circuits: diagnostics.openCircuits },
  };
}

async function getProjectionWaveDiagnostics(
  options: RuntimeReadinessOptions,
): Promise<ProjectionWaveDiagnostics> {
  const store = options.entityService.getProjectionStore();
  const activeWave = await store.getActiveWave();
  if (!activeWave) return { waveId: null, strandedRules: [] };

  const rules = await store.listWaveRules(activeWave.id);
  const candidates = rules.filter(
    (rule) => rule.status === "queued" || rule.status === "failed",
  );
  const strandedRules = (
    await Promise.all(
      candidates.map(async (rule): Promise<StrandedProjectionRule | null> => {
        const job = rule.jobId
          ? await options.jobQueueService.getStatus(rule.jobId)
          : null;
        if (
          rule.status !== "failed" &&
          job &&
          (job.status === "pending" || job.status === "processing")
        ) {
          return null;
        }
        return {
          ruleId: rule.ruleId,
          jobId: rule.jobId,
          jobStatus: job?.status ?? "missing",
        };
      }),
    )
  ).filter((rule): rule is StrandedProjectionRule => rule !== null);

  return { waveId: activeWave.id, strandedRules };
}

function projectionWaveCheck(
  diagnostics: ProjectionWaveDiagnostics,
): RuntimeHealthCheck {
  if (!diagnostics.waveId) {
    return {
      name: "projection-waves",
      status: "healthy",
      message: "No active projection wave",
    };
  }
  if (diagnostics.strandedRules.length === 0) {
    return {
      name: "projection-waves",
      status: "healthy",
      message: `Projection wave ${diagnostics.waveId} is progressing`,
    };
  }
  return {
    name: "projection-waves",
    status: "degraded",
    message: `Projection wave ${diagnostics.waveId} has ${diagnostics.strandedRules.length} stranded rule job(s)`,
    details: {
      waveId: diagnostics.waveId,
      strandedRules: diagnostics.strandedRules,
    },
  };
}

function daemonCheck(statuses: DaemonStatusInfo[]): RuntimeHealthCheck {
  const unhealthy = statuses.filter(
    (daemon) =>
      daemon.status !== "running" || daemon.health?.status === "error",
  );
  return unhealthy.length === 0
    ? {
        name: "daemons",
        status: "healthy",
        message: `${statuses.length} daemon(s) healthy`,
      }
    : {
        name: "daemons",
        status: "degraded",
        message: `${unhealthy.length} daemon(s) unhealthy`,
        details: {
          daemons: unhealthy.map((daemon) => ({
            name: daemon.name,
            status: daemon.status,
            health: daemon.health?.status,
            message: daemon.health?.message,
          })),
        },
      };
}

export async function getRuntimeReadiness(
  options: RuntimeReadinessOptions,
): Promise<RuntimeReadiness> {
  const now = options.now?.() ?? Date.now();
  const memory = (options.memoryUsage ?? process.memoryUsage)();
  const [
    entityResult,
    queueResult,
    daemonResult,
    processResult,
    projectionResult,
    projectionWaveResult,
    operationalHealthResult,
  ] = await Promise.allSettled([
    options.entityService.getEntityCounts(
      internalFullScope("runtime readiness database probe"),
    ),
    options.jobQueueService.getDiagnostics(now),
    options.daemonRegistry.getStatuses(),
    (options.readProcessSignals ?? readLinuxProcessSignals)(),
    options.projectionRuntimeSupervisor.getDiagnostics(),
    getProjectionWaveDiagnostics(options),
    options.operationalHealthRegistry.getChecks(),
  ]);

  const diagnostics =
    queueResult.status === "fulfilled" ? queueResult.value : null;
  const daemonStatuses =
    daemonResult.status === "fulfilled" ? daemonResult.value : [];
  const processSignals =
    processResult.status === "fulfilled"
      ? processResult.value
      : {
          fileDescriptors: null,
          processCount: null,
          zombieCount: null,
        };
  const projectionDiagnostics: ProjectionRuntimeDiagnostics =
    projectionResult.status === "fulfilled"
      ? projectionResult.value
      : {
          status: "unhealthy",
          initialized: false,
          trackedRoots: 0,
          openCircuits: [],
        };
  const routingChecks: RuntimeHealthCheck[] = [
    dependencyCheck(
      "entity-database",
      entityResult,
      "Entity database is accessible",
    ),
    dependencyCheck(
      "job-queue-database",
      queueResult,
      "Job queue database is accessible",
    ),
    workerCheck(diagnostics),
    leaseCheck(diagnostics),
    projectionResult.status === "fulfilled"
      ? projectionCheck(projectionDiagnostics)
      : {
          name: "projection-circuits",
          status: "degraded",
          message: getErrorMessage(projectionResult.reason),
        },
    projectionWaveResult.status === "fulfilled"
      ? projectionWaveCheck(projectionWaveResult.value)
      : {
          name: "projection-waves",
          status: "degraded",
          message: getErrorMessage(projectionWaveResult.reason),
        },
    daemonResult.status === "fulfilled"
      ? daemonCheck(daemonStatuses)
      : {
          name: "daemons",
          status: "degraded",
          message: getErrorMessage(daemonResult.reason),
        },
  ];
  const operationalChecks: RuntimeHealthCheck[] =
    operationalHealthResult.status === "fulfilled"
      ? operationalHealthResult.value
      : [
          {
            name: "plugin-operational-health",
            status: "degraded",
            message: "Plugin operational health is unavailable",
          },
        ];
  const checks = [...routingChecks, ...operationalChecks];

  return {
    status: routingChecks.some((check) => check.status === "unhealthy")
      ? "not_ready"
      : "ready",
    operationalStatus: checks.some((check) => check.status !== "healthy")
      ? "degraded"
      : "operational",
    checkedAt: new Date(now).toISOString(),
    checks,
    resources: {
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      fileDescriptors: processSignals.fileDescriptors,
      processes: {
        total: processSignals.processCount,
        zombies: processSignals.zombieCount,
      },
      queue: diagnostics,
      projection: {
        initialized: projectionDiagnostics.initialized,
        trackedRoots: projectionDiagnostics.trackedRoots,
        openCircuits: projectionDiagnostics.openCircuits,
      },
      worker: diagnostics?.workerSessions ?? {
        total: 0,
        active: 0,
        stale: 0,
        latestHeartbeatAgeMs: null,
      },
    },
  };
}
