import type { FetchLike } from "@brains/utils/fetch-like";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";

export const directorySyncStressProfileSchema: z.ZodEnum<{
  regression: "regression";
  load: "load";
  stress: "stress";
}> = z.enum(["regression", "load", "stress"]);

export type DirectorySyncStressProfile = z.output<
  typeof directorySyncStressProfileSchema
>;

export const directorySyncStressOperationSchema: z.ZodEnum<{
  add: "add";
  update: "update";
  rename: "rename";
  delete: "delete";
}> = z.enum(["add", "update", "rename", "delete"]);

export type DirectorySyncStressOperation = z.output<
  typeof directorySyncStressOperationSchema
>;

export const directorySyncStressPhaseSchema: z.ZodObject<{
  id: z.ZodString;
  operation: typeof directorySyncStressOperationSchema;
  count: z.ZodNumber;
  targetProbeCount: z.ZodNumber;
  settleMs: z.ZodNumber;
}> = z.object({
  id: z.string().min(1),
  operation: directorySyncStressOperationSchema,
  count: z.number().int().positive().max(700),
  targetProbeCount: z.number().int().min(0).max(700),
  settleMs: z.number().int().nonnegative().max(300_000),
});

export type DirectorySyncStressPhase = z.output<
  typeof directorySyncStressPhaseSchema
>;

export const directorySyncStressPlanSchema: z.ZodObject<{
  profile: typeof directorySyncStressProfileSchema;
  maximumProbeCount: z.ZodNumber;
  maximumExternalAiCalls: z.ZodOptional<z.ZodNumber>;
  phases: z.ZodArray<typeof directorySyncStressPhaseSchema>;
}> = z.object({
  profile: directorySyncStressProfileSchema,
  maximumProbeCount: z.number().int().positive().max(700),
  maximumExternalAiCalls: z.number().int().nonnegative().max(10_000).optional(),
  phases: z.array(directorySyncStressPhaseSchema).min(1),
});

export type DirectorySyncStressPlan = z.output<
  typeof directorySyncStressPlanSchema
>;

export const stressBaselineSchema: z.ZodObject<{
  entities: z.ZodNumber;
  notes: z.ZodNumber;
  version: z.ZodString;
}> = z.object({
  entities: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  version: z.string().min(1),
});

export type StressBaseline = z.output<typeof stressBaselineSchema>;

export const stressHealthSampleSchema: z.ZodObject<{
  timestamp: z.ZodISODateTime;
  endpoint: z.ZodString;
  status: z.ZodNumber;
  durationMs: z.ZodNumber;
  ok: z.ZodBoolean;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  timestamp: z.iso.datetime(),
  endpoint: z.string().startsWith("/"),
  status: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  ok: z.boolean(),
  error: z.string().optional(),
});

export type StressHealthSample = z.output<typeof stressHealthSampleSchema>;

export const stressRuntimeSampleSchema: z.ZodObject<{
  timestamp: z.ZodISODateTime;
  cpuPercent: z.ZodNumber;
  memoryPercent: z.ZodNumber;
  pids: z.ZodNumber;
}> = z.object({
  timestamp: z.iso.datetime(),
  cpuPercent: z.number().nonnegative(),
  memoryPercent: z.number().nonnegative(),
  pids: z.number().int().nonnegative(),
});

export type StressRuntimeSample = z.output<typeof stressRuntimeSampleSchema>;

export const stressPhaseResultSchema: z.ZodObject<{
  id: z.ZodString;
  operation: typeof directorySyncStressOperationSchema;
  count: z.ZodNumber;
  success: z.ZodBoolean;
  commitLatencyMs: z.ZodOptional<z.ZodNumber>;
  persistenceLatencyMs: z.ZodOptional<z.ZodNumber>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  id: z.string().min(1),
  operation: directorySyncStressOperationSchema,
  count: z.number().int().positive(),
  success: z.boolean(),
  commitLatencyMs: z.number().nonnegative().optional(),
  persistenceLatencyMs: z.number().nonnegative().optional(),
  error: z.string().optional(),
});

export type StressPhaseResult = z.output<typeof stressPhaseResultSchema>;

export const stressCleanupResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  probesRemaining: z.ZodNumber;
  finalEntities: z.ZodOptional<z.ZodNumber>;
  finalNotes: z.ZodOptional<z.ZodNumber>;
  contentTreeRestored: z.ZodOptional<z.ZodBoolean>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  success: z.boolean(),
  probesRemaining: z.number().int().nonnegative(),
  finalEntities: z.number().int().nonnegative().optional(),
  finalNotes: z.number().int().nonnegative().optional(),
  contentTreeRestored: z.boolean().optional(),
  error: z.string().optional(),
});

export type StressCleanupResult = z.output<typeof stressCleanupResultSchema>;

export const stressContainerStateSchema: z.ZodObject<{
  status: z.ZodString;
  restartCount: z.ZodNumber;
  oomKilled: z.ZodBoolean;
}> = z.object({
  status: z.string(),
  restartCount: z.number().int().nonnegative(),
  oomKilled: z.boolean(),
});

export type StressContainerState = z.output<typeof stressContainerStateSchema>;

export const stressMetricsSchema: z.ZodObject<{
  health: z.ZodArray<typeof stressHealthSampleSchema>;
  runtime: z.ZodArray<typeof stressRuntimeSampleSchema>;
  externalAiCalls: z.ZodOptional<z.ZodNumber>;
  container: z.ZodOptional<typeof stressContainerStateSchema>;
}> = z.object({
  health: z.array(stressHealthSampleSchema),
  runtime: z.array(stressRuntimeSampleSchema),
  externalAiCalls: z.number().int().nonnegative().optional(),
  container: stressContainerStateSchema.optional(),
});

export type StressMetrics = z.output<typeof stressMetricsSchema>;

export const directorySyncStressReportSchema: z.ZodObject<{
  profile: typeof directorySyncStressProfileSchema;
  success: z.ZodBoolean;
  baseline: typeof stressBaselineSchema;
  phases: z.ZodArray<typeof stressPhaseResultSchema>;
  cleanup: typeof stressCleanupResultSchema;
  metrics: typeof stressMetricsSchema;
  failure: z.ZodOptional<z.ZodString>;
}> = z.object({
  profile: directorySyncStressProfileSchema,
  success: z.boolean(),
  baseline: stressBaselineSchema,
  phases: z.array(stressPhaseResultSchema),
  cleanup: stressCleanupResultSchema,
  metrics: stressMetricsSchema,
  failure: z.string().optional(),
});

export type DirectorySyncStressReport = z.output<
  typeof directorySyncStressReportSchema
>;

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
