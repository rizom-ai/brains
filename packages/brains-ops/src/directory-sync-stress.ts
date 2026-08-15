import type { FetchLike } from "@brains/deploy-support/origin-ca";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";

export type DirectorySyncStressProfile = "regression" | "load" | "stress";
export type DirectorySyncStressOperation =
  "add" | "update" | "rename" | "delete";

export interface DirectorySyncStressPhase {
  id: string;
  operation: DirectorySyncStressOperation;
  count: number;
  targetProbeCount: number;
  settleMs: number;
}

export interface DirectorySyncStressPlan {
  profile: DirectorySyncStressProfile;
  maximumProbeCount: number;
  maximumExternalAiCalls?: number | undefined;
  phases: DirectorySyncStressPhase[];
}

export interface StressBaseline {
  entities: number;
  notes: number;
  version: string;
}

export interface StressHealthSample {
  timestamp: string;
  endpoint: string;
  status: number;
  durationMs: number;
  ok: boolean;
  error?: string | undefined;
}

export interface StressRuntimeSample {
  timestamp: string;
  cpuPercent: number;
  memoryPercent: number;
  pids: number;
}

export interface StressPhaseResult {
  id: string;
  operation: DirectorySyncStressOperation;
  count: number;
  success: boolean;
  commitLatencyMs?: number | undefined;
  persistenceLatencyMs?: number | undefined;
  error?: string | undefined;
}

export interface StressCleanupResult {
  success: boolean;
  probesRemaining: number;
  finalEntities?: number | undefined;
  finalNotes?: number | undefined;
  contentTreeRestored?: boolean | undefined;
  error?: string | undefined;
}

export interface StressContainerState {
  status: string;
  restartCount: number;
  oomKilled: boolean;
}

export interface StressMetrics {
  health: StressHealthSample[];
  runtime: StressRuntimeSample[];
  externalAiCalls?: number | undefined;
  container?: StressContainerState | undefined;
}

export interface DirectorySyncStressReport {
  profile: DirectorySyncStressProfile;
  success: boolean;
  baseline: StressBaseline;
  phases: StressPhaseResult[];
  cleanup: StressCleanupResult;
  metrics: StressMetrics;
  failure?: string | undefined;
}

export const directorySyncStressProfileSchema: z.ZodType<DirectorySyncStressProfile> =
  z.enum(["regression", "load", "stress"]);

export const directorySyncStressOperationSchema: z.ZodType<DirectorySyncStressOperation> =
  z.enum(["add", "update", "rename", "delete"]);

export const directorySyncStressPhaseSchema: z.ZodType<DirectorySyncStressPhase> =
  z.object({
    id: z.string().min(1),
    operation: directorySyncStressOperationSchema,
    count: z.number().int().positive().max(700),
    targetProbeCount: z.number().int().min(0).max(700),
    settleMs: z.number().int().nonnegative().max(300_000),
  });

export const directorySyncStressPlanSchema: z.ZodType<DirectorySyncStressPlan> =
  z.object({
    profile: directorySyncStressProfileSchema,
    maximumProbeCount: z.number().int().positive().max(700),
    maximumExternalAiCalls: z
      .number()
      .int()
      .nonnegative()
      .max(10_000)
      .optional(),
    phases: z.array(directorySyncStressPhaseSchema).min(1),
  });

export const stressBaselineSchema: z.ZodType<StressBaseline> = z.object({
  entities: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  version: z.string().min(1),
});

export const stressHealthSampleSchema: z.ZodType<StressHealthSample> = z.object(
  {
    timestamp: z.iso.datetime(),
    endpoint: z.string().startsWith("/"),
    status: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    ok: z.boolean(),
    error: z.string().optional(),
  },
);

export const stressRuntimeSampleSchema: z.ZodType<StressRuntimeSample> =
  z.object({
    timestamp: z.iso.datetime(),
    cpuPercent: z.number().nonnegative(),
    memoryPercent: z.number().nonnegative(),
    pids: z.number().int().nonnegative(),
  });

export const stressPhaseResultSchema: z.ZodType<StressPhaseResult> = z.object({
  id: z.string().min(1),
  operation: directorySyncStressOperationSchema,
  count: z.number().int().positive(),
  success: z.boolean(),
  commitLatencyMs: z.number().nonnegative().optional(),
  persistenceLatencyMs: z.number().nonnegative().optional(),
  error: z.string().optional(),
});

export const stressCleanupResultSchema: z.ZodType<StressCleanupResult> =
  z.object({
    success: z.boolean(),
    probesRemaining: z.number().int().nonnegative(),
    finalEntities: z.number().int().nonnegative().optional(),
    finalNotes: z.number().int().nonnegative().optional(),
    contentTreeRestored: z.boolean().optional(),
    error: z.string().optional(),
  });

export const stressMetricsSchema: z.ZodType<StressMetrics> = z.object({
  health: z.array(stressHealthSampleSchema),
  runtime: z.array(stressRuntimeSampleSchema),
  externalAiCalls: z.number().int().nonnegative().optional(),
  container: z
    .object({
      status: z.string(),
      restartCount: z.number().int().nonnegative(),
      oomKilled: z.boolean(),
    })
    .optional(),
});

export const directorySyncStressReportSchema: z.ZodType<DirectorySyncStressReport> =
  z.object({
    profile: directorySyncStressProfileSchema,
    success: z.boolean(),
    baseline: stressBaselineSchema,
    phases: z.array(stressPhaseResultSchema),
    cleanup: stressCleanupResultSchema,
    metrics: stressMetricsSchema,
    failure: z.string().optional(),
  });

export interface DirectorySyncStressTarget {
  handle: string;
  domain: string;
  contentRepo: string;
  confirmation: string;
}

export interface DirectorySyncStressDriver {
  prepare(plan: DirectorySyncStressPlan): Promise<StressBaseline>;
  startMonitoring(): Promise<void>;
  executePhase(
    phase: DirectorySyncStressPhase,
    baseline: StressBaseline,
  ): Promise<StressPhaseResult>;
  cleanup(baseline: StressBaseline): Promise<StressCleanupResult>;
  stopMonitoring(): Promise<StressMetrics>;
}

const plans: Record<DirectorySyncStressProfile, DirectorySyncStressPlan> = {
  regression: {
    profile: "regression",
    maximumProbeCount: 20,
    phases: [
      phase("add20", "add", 20, 20, 0),
      phase("update20", "update", 20, 20, 30_000),
      phase("delete20", "delete", 20, 0, 150_000),
    ],
  },
  load: {
    profile: "load",
    maximumProbeCount: 350,
    phases: [
      phase("add50", "add", 50, 50, 0),
      phase("add150", "add", 100, 150, 0),
      phase("add350", "add", 200, 350, 0),
      phase("update350a", "update", 350, 350, 45_000),
      phase("rename100", "rename", 100, 350, 45_000),
      phase("update350b", "update", 350, 350, 45_000),
      phase("delete350", "delete", 350, 0, 150_000),
    ],
  },
  stress: {
    profile: "stress",
    maximumProbeCount: 700,
    phases: [
      phase("add50", "add", 50, 50, 0),
      phase("add150", "add", 100, 150, 0),
      phase("add350", "add", 200, 350, 0),
      phase("add700", "add", 350, 700, 0),
      phase("update700a", "update", 700, 700, 45_000),
      phase("rename200", "rename", 200, 700, 45_000),
      phase("update700b", "update", 700, 700, 45_000),
      phase("delete700", "delete", 700, 0, 150_000),
    ],
  },
};

function phase(
  id: string,
  operation: DirectorySyncStressOperation,
  count: number,
  targetProbeCount: number,
  settleMs: number,
): DirectorySyncStressPhase {
  return directorySyncStressPhaseSchema.parse({
    id,
    operation,
    count,
    targetProbeCount,
    settleMs,
  });
}

export function resolveDirectorySyncStressPlan(
  profile: DirectorySyncStressProfile,
): DirectorySyncStressPlan {
  return directorySyncStressPlanSchema.parse(structuredClone(plans[profile]));
}

export function assertDirectorySyncStressTarget(
  target: DirectorySyncStressTarget,
): void {
  const expectedConfirmation = `stress:${target.handle}`;
  if (target.confirmation !== expectedConfirmation) {
    throw new Error(
      `Directory-sync stress requires --confirm ${expectedConfirmation}`,
    );
  }

  const smokeMarker = /(^|[-_.])smoke($|[-_.])/i;
  if (
    !smokeMarker.test(target.handle) ||
    !smokeMarker.test(target.domain) ||
    !smokeMarker.test(target.contentRepo)
  ) {
    throw new Error(
      "Directory-sync stress is smoke-only; handle, domain, and content repository must all identify smoke",
    );
  }
}

export interface SampleStressHealthOptions {
  fetchImpl?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
}

export async function sampleStressHealth(
  url: string,
  options: SampleStressHealthOptions = {},
): Promise<StressHealthSample> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now: () => Date = options.now ?? ((): Date => new Date());
  const timeoutMs = options.timeoutMs ?? 20_000;
  const started = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return stressHealthSampleSchema.parse({
      timestamp: started.toISOString(),
      endpoint: new URL(url).pathname,
      status: response.status,
      durationMs: Math.max(0, now().getTime() - started.getTime()),
      ok: response.ok,
    });
  } catch (error) {
    return stressHealthSampleSchema.parse({
      timestamp: started.toISOString(),
      endpoint: new URL(url).pathname,
      status: 0,
      durationMs: Math.max(0, now().getTime() - started.getTime()),
      ok: false,
      error: formatError(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function runDirectorySyncStressPlan(
  plan: DirectorySyncStressPlan,
  driver: DirectorySyncStressDriver,
): Promise<DirectorySyncStressReport> {
  const validatedPlan = directorySyncStressPlanSchema.parse(plan);
  const phases: StressPhaseResult[] = [];
  let failure: string | undefined;
  const baseline = await driver.prepare(validatedPlan);

  let cleanup: StressCleanupResult;
  let metrics: StressMetrics;
  try {
    try {
      await driver.startMonitoring();
    } catch (error) {
      failure = `monitor: ${formatErrorMessage(error)}`;
    }

    if (!failure) {
      for (const stressPhase of validatedPlan.phases) {
        try {
          const result = stressPhaseResultSchema.parse(
            await driver.executePhase(stressPhase, baseline),
          );
          phases.push(result);
          if (!result.success) {
            failure = `${stressPhase.id}: ${result.error ?? "phase failed"}`;
            break;
          }
        } catch (error) {
          const message = formatErrorMessage(error);
          phases.push({
            id: stressPhase.id,
            operation: stressPhase.operation,
            count: stressPhase.count,
            success: false,
            error: message,
          });
          failure = `${stressPhase.id}: ${message}`;
          break;
        }
      }
    }
  } finally {
    try {
      cleanup = stressCleanupResultSchema.parse(await driver.cleanup(baseline));
      if (!cleanup.success && !failure) {
        failure = cleanup.error ?? "cleanup failed";
      }
    } catch (error) {
      const message = formatErrorMessage(error);
      cleanup = {
        success: false,
        probesRemaining: 0,
        error: message,
      };
      failure ??= `cleanup: ${message}`;
    }
    try {
      metrics = stressMetricsSchema.parse(await driver.stopMonitoring());
    } catch (error) {
      const message = formatErrorMessage(error);
      metrics = { health: [], runtime: [] };
      failure ??= `monitor: ${message}`;
    }
  }

  failure ??= stressMetricsFailure(
    metrics,
    validatedPlan.maximumExternalAiCalls ?? 0,
  );

  return directorySyncStressReportSchema.parse({
    profile: validatedPlan.profile,
    success:
      failure === undefined &&
      phases.length === validatedPlan.phases.length &&
      cleanup.success,
    baseline,
    phases,
    cleanup,
    metrics,
    ...(failure ? { failure } : {}),
  });
}

export function stressMetricsFailure(
  metrics: StressMetrics,
  maximumExternalAiCalls = 0,
): string | undefined {
  const healthFailure = metrics.health.find((sample) => !sample.ok);
  if (healthFailure) {
    return `health: ${healthFailure.endpoint} unavailable`;
  }
  const externalAiCalls = metrics.externalAiCalls ?? 0;
  if (externalAiCalls > maximumExternalAiCalls) {
    return maximumExternalAiCalls === 0
      ? `external AI: observed ${externalAiCalls} call(s)`
      : `external AI: observed ${externalAiCalls} call(s), cap ${maximumExternalAiCalls}`;
  }
  if (metrics.container?.oomKilled) {
    return "container: OOM killed";
  }
  const restartCount = metrics.container?.restartCount ?? 0;
  if (restartCount > 0) {
    return `container: restarted ${restartCount} time(s)`;
  }
  if (metrics.container && metrics.container.status !== "running") {
    return `container: ${metrics.container.status}`;
  }
  return undefined;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function formatErrorMessage(error: unknown): string {
  return getErrorMessage(error);
}
