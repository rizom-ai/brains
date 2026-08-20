import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { availableParallelism, tmpdir } from "node:os";
import { Shell } from "@brains/core";
import { MigrationManager, resolve } from "@brains/app";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import { Logger, LogLevel } from "@brains/utils/logger";
import { canonicalBrain } from "../src/model/canonical-brain";
import {
  MOCK_LOAD_API_KEY,
  MOCK_LOAD_MODEL,
  MOCK_LOAD_PROBE_MARKER,
  MOCK_LOAD_UPDATE_MARKER,
  MockLoadAIService,
  MockLoadEmbeddingService,
  MockLoadTracker,
  type MockLoadSnapshot,
} from "./helpers/mocked-ai-load-services";
import {
  constrainCurrentProcessCpu,
  startProcessResourceMonitor,
  type ProcessResourceSnapshot,
} from "./helpers/process-resource-monitor";

const IMPORT_COUNT = Number.parseInt(
  process.env["MOCKED_AI_IMPORT_COUNT"] ?? "40",
  10,
);
const SERVICE_DELAY_MS = Number.parseInt(
  process.env["MOCKED_AI_SERVICE_DELAY_MS"] ?? "5",
  10,
);
const IMPORT_TIMEOUT_MS = 120_000;
const SETTLE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 25;
const RESOURCE_POLL_INTERVAL_MS = 100;
const CPU_SATURATION_FRACTION = 0.9;
const MAX_SUSTAINED_CPU_SATURATION_MS = 5_000;
const EVENT_LOOP_STALL_THRESHOLD_MS = 500;
const MAX_EVENT_LOOP_DELAY_MS = 1_000;
const MAX_SUSTAINED_EVENT_LOOP_DELAY_MS = 5_000;
const RESOURCE_SETTLE_MS = 5_000;
const MAX_RSS_BYTES = 1_216 * 1024 * 1024;
const MAX_RSS_GROWTH_BYTES = 768 * 1024 * 1024;
const MAX_FINAL_RSS_BYTES = MAX_RSS_BYTES;
const MAX_FINAL_RSS_GROWTH_BYTES = MAX_RSS_GROWTH_BYTES;
/** Work cascades here, so an empty queue only counts after it stays empty. */
const QUIET_MS = 250;

interface QueueSample {
  atMs: number;
  pending: number;
  processing: number;
  duePending: number;
  embeddingPending: number;
  embeddingProcessing: number;
  projectionPending: number;
  projectionProcessing: number;
  operationalStatus: "operational" | "degraded";
  readinessStatus: "ready" | "not_ready";
}

interface PhaseAICalls {
  embeddingCalls: number;
  probeEmbeddingCalls: number;
  completedProbeEmbeddingCalls: number;
  updateEmbeddingCalls: number;
  completedUpdateEmbeddingCalls: number;
  objectCalls: number;
  textCalls: number;
}

interface FeatureLoadPhaseReport {
  durationMs: number;
  ai: PhaseAICalls;
  queue: {
    samples: number;
    maxPending: number;
    maxProcessing: number;
    maxEmbeddingOutstanding: number;
    maxProjectionOutstanding: number;
    pendingAtEmbeddingCompletion: number;
    operationalSamples: number;
    degradedSamples: number;
    notReadySamples: number;
    finalPending: number;
    finalProcessing: number;
  };
}

interface FeatureLoadReport {
  importCount: number;
  serviceDelayMs: number;
  durationMs: number;
  cpuCapacity: number;
  resources: ProcessResourceSnapshot;
  resourceCheckpoints: {
    add: ProcessResourceSnapshot;
    update: ProcessResourceSnapshot;
  };
  ai: MockLoadSnapshot;
  phases: {
    add: FeatureLoadPhaseReport;
    update: FeatureLoadPhaseReport;
  };
}

function jobCount(
  byType: readonly { type: string; status: string; count: number }[],
  type: string,
  status: string,
): number {
  return (
    byType.find((entry) => entry.type === type && entry.status === status)
      ?.count ?? 0
  );
}

async function waitFor(
  description: string,
  timeoutMs: number,
  predicate: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

/**
 * Sample on its own cadence. Sampling used to live inside the wait predicates,
 * so nothing was recorded until the import call had already returned — exactly
 * the window worth profiling.
 */
function startSampler(
  intervalMs: number,
  take: () => Promise<unknown>,
): { stop: () => Promise<void> } {
  let running = true;
  const tick = async (): Promise<void> => {
    if (!running) return;
    await take();
    await Bun.sleep(intervalMs);
    return tick();
  };
  const finished = tick();
  return {
    stop: async (): Promise<void> => {
      running = false;
      await finished;
    },
  };
}

async function writeImportedNotes(
  dataDir: string,
  count: number,
  phase: "add" | "update",
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  for (let index = 0; index < count; index++) {
    const id = `mocked-feature-load-${index.toString().padStart(4, "0")}`;
    await writeFile(
      join(dataDir, `${id}.md`),
      [
        "---",
        `title: ${MOCK_LOAD_PROBE_MARKER} ${index}`,
        "tags:",
        "  - mocked-feature-load",
        "---",
        "",
        `${MOCK_LOAD_PROBE_MARKER} ${index}`,
        "",
        `Deterministic local content for import ${index}.`,
        ...(phase === "update"
          ? ["", `${MOCK_LOAD_UPDATE_MARKER} ${index}`]
          : []),
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

function diffAI(
  before: MockLoadSnapshot,
  after: MockLoadSnapshot,
): PhaseAICalls {
  return {
    embeddingCalls: after.embeddingCalls - before.embeddingCalls,
    probeEmbeddingCalls: after.probeEmbeddingCalls - before.probeEmbeddingCalls,
    completedProbeEmbeddingCalls:
      after.completedProbeEmbeddingCalls - before.completedProbeEmbeddingCalls,
    updateEmbeddingCalls:
      after.updateEmbeddingCalls - before.updateEmbeddingCalls,
    completedUpdateEmbeddingCalls:
      after.completedUpdateEmbeddingCalls -
      before.completedUpdateEmbeddingCalls,
    objectCalls: after.objectCalls - before.objectCalls,
    textCalls: after.textCalls - before.textCalls,
  };
}

function maxOf(
  samples: readonly QueueSample[],
  selector: (sample: QueueSample) => number,
): number {
  return samples.reduce(
    (maximum, sample) => Math.max(maximum, selector(sample)),
    0,
  );
}

describe("directory import burst with locally mocked AI features", () => {
  let shell: Shell | undefined;
  let tempRoot: string | undefined;

  afterEach(async () => {
    if (shell) {
      await shell.shutdown();
      shell = undefined;
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
    Logger.resetInstance();
  });

  it(
    "keeps add and update AI work parallel, bounded, and observable",
    async () => {
      if (!Number.isInteger(IMPORT_COUNT) || IMPORT_COUNT < 1) {
        throw new Error("MOCKED_AI_IMPORT_COUNT must be a positive integer");
      }
      if (!Number.isFinite(SERVICE_DELAY_MS) || SERVICE_DELAY_MS < 0) {
        throw new Error("MOCKED_AI_SERVICE_DELAY_MS must be non-negative");
      }
      const configuredCpuLimit = process.env["MOCKED_AI_CPU_LIMIT"]
        ? Number.parseInt(process.env["MOCKED_AI_CPU_LIMIT"], 10)
        : undefined;
      if (
        configuredCpuLimit !== undefined &&
        (!Number.isInteger(configuredCpuLimit) || configuredCpuLimit < 1)
      ) {
        throw new Error("MOCKED_AI_CPU_LIMIT must be a positive integer");
      }
      const resourceAcceptanceEnabled = configuredCpuLimit !== undefined;
      const cpuCapacity =
        configuredCpuLimit === undefined
          ? availableParallelism()
          : await constrainCurrentProcessCpu(configuredCpuLimit);

      tempRoot = await mkdtemp(join(tmpdir(), "mocked-ai-load-"));
      const dataDir = join(tempRoot, "brain-data");
      const tracker = new MockLoadTracker();
      const aiService = new MockLoadAIService(tracker, {
        delayMs: SERVICE_DELAY_MS,
      });
      const embeddingService = new MockLoadEmbeddingService(tracker, {
        delayMs: SERVICE_DELAY_MS,
        dimensions: 1536,
      });

      Logger.resetInstance();
      const logger = Logger.getInstance({ level: LogLevel.ERROR });
      const databaseUrl = `file:${join(tempRoot, "brain.db")}`;
      const jobQueueDatabaseUrl = `file:${join(tempRoot, "jobs.db")}`;
      const conversationDatabaseUrl = `file:${join(tempRoot, "conversations.db")}`;
      const runtimeStateDatabaseUrl = `file:${join(tempRoot, "runtime-state.db")}`;
      const embeddingDatabaseUrl = `file:${join(tempRoot, "embeddings.db")}`;
      await new MigrationManager(logger).runAllMigrations({
        database: databaseUrl,
        jobQueueDatabase: jobQueueDatabaseUrl,
        conversationDatabase: conversationDatabaseUrl,
        runtimeStateDatabase: runtimeStateDatabaseUrl,
      });

      const resolved = resolve(
        canonicalBrain,
        {},
        {
          name: "Mocked AI import load",
          bundles: ["core"],
          remove: [
            "atproto-registry",
            "auth-service",
            "account",
            "notifications",
            "playbook",
            "playbooks",
            "onboarding",
            "email",
            "cms",
            "dashboard",
            "admin",
            "mcp",
            "webserver",
            "web-chat",
            "chat",
            "a2a",
          ],
          plugins: {
            "directory-sync": {
              autoSync: false,
              seedContent: false,
              initialSync: true,
            },
            topics: {
              enableAutoExtraction: true,
              maxEntitiesPerBatch: 4,
            },
          },
        },
      );

      shell = Shell.createFresh(
        {
          name: resolved.name,
          version: resolved.version,
          plugins: resolved.plugins ?? [],
          permissions: resolved.permissions ?? {},
          spaces: resolved.spaces ?? [],
          database: { url: databaseUrl },
          jobQueueDatabase: { url: jobQueueDatabaseUrl },
          conversationDatabase: { url: conversationDatabaseUrl },
          runtimeStateDatabase: { url: runtimeStateDatabaseUrl },
          embeddingDatabase: { url: embeddingDatabaseUrl },
          dataDir,
          ai: {
            apiKey: MOCK_LOAD_API_KEY,
            model: MOCK_LOAD_MODEL,
          },
          embedding: { enabled: true },
          logging: { level: "error", context: "mocked-ai-load" },
          ...(resolved.identity ? { identity: resolved.identity } : {}),
          ...(resolved.profileKind
            ? { profileKind: resolved.profileKind }
            : {}),
          ...(resolved.agentInstructions
            ? { agentInstructions: resolved.agentInstructions }
            : {}),
        },
        { logger, aiService, embeddingService },
      );
      const runningShell = shell;
      await runningShell.initialize();

      const queue = runningShell.getJobQueueService();
      await queue.waitForIdle({
        quietMs: QUIET_MS,
        timeoutMs: SETTLE_TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
      });

      const directoryPlugin = runningShell
        .getPluginManager()
        .getPlugin("directory-sync");
      if (!(directoryPlugin instanceof DirectorySyncPlugin)) {
        throw new Error("Directory sync plugin was not registered");
      }
      const directorySync = directoryPlugin.getDirectorySync();
      if (!directorySync) throw new Error("Directory sync was not initialized");

      const runPhase = async (
        phase: "add" | "update",
        completedEmbeddings: (snapshot: MockLoadSnapshot) => number,
      ): Promise<FeatureLoadPhaseReport> => {
        await writeImportedNotes(dataDir, IMPORT_COUNT, phase);
        const before = tracker.snapshot();
        const samples: QueueSample[] = [];
        const sample = async (): Promise<QueueSample> => {
          const [diagnostics, readiness] = await Promise.all([
            queue.getDiagnostics(),
            runningShell.getRuntimeReadiness(),
          ]);
          const current: QueueSample = {
            atMs: Date.now(),
            pending: diagnostics.totals.pending,
            processing: diagnostics.totals.processing,
            duePending: diagnostics.duePending,
            embeddingPending: jobCount(
              diagnostics.byType,
              "shell:embedding",
              "pending",
            ),
            embeddingProcessing: jobCount(
              diagnostics.byType,
              "shell:embedding",
              "processing",
            ),
            projectionPending: jobCount(
              diagnostics.byType,
              "shell:projection-rule",
              "pending",
            ),
            projectionProcessing: jobCount(
              diagnostics.byType,
              "shell:projection-rule",
              "processing",
            ),
            operationalStatus: readiness.operationalStatus,
            readinessStatus: readiness.status,
          };
          samples.push(current);
          return current;
        };

        const sampler = startSampler(POLL_INTERVAL_MS, sample);
        const startedAt = Date.now();
        let embeddingCompletedAt: QueueSample | undefined;
        const completedBefore = completedEmbeddings(before);
        try {
          const importResult = await directorySync.sync();
          expect(importResult.import.failed).toBe(0);
          // At least the notes this phase wrote. Auto-extraction is on, so
          // by the update phase the topics the add phase derived are on disk
          // too and import alongside them — that is the load being measured,
          // not a leak.
          expect(importResult.import.imported).toBeGreaterThanOrEqual(
            IMPORT_COUNT,
          );

          await waitFor(
            `all ${phase} embeddings`,
            SETTLE_TIMEOUT_MS,
            async () => {
              const current = await sample();
              if (
                completedEmbeddings(tracker.snapshot()) - completedBefore >=
                IMPORT_COUNT
              ) {
                embeddingCompletedAt = current;
                return true;
              }
              return false;
            },
          );
          await waitFor(
            `${phase} topic extraction to start`,
            SETTLE_TIMEOUT_MS,
            async () => {
              await sample();
              return tracker.snapshot().objectCalls > before.objectCalls;
            },
          );
          await queue.waitForIdle({
            quietMs: QUIET_MS,
            timeoutMs: SETTLE_TIMEOUT_MS,
            pollIntervalMs: POLL_INTERVAL_MS,
          });
        } finally {
          await sampler.stop();
        }
        const finalSample = await sample();
        const after = tracker.snapshot();
        if (!embeddingCompletedAt) {
          throw new Error(`${phase} embedding completion was not sampled`);
        }

        return {
          durationMs: Date.now() - startedAt,
          ai: diffAI(before, after),
          queue: {
            samples: samples.length,
            maxPending: maxOf(samples, (entry) => entry.pending),
            maxProcessing: maxOf(samples, (entry) => entry.processing),
            maxEmbeddingOutstanding: maxOf(
              samples,
              (entry) => entry.embeddingPending + entry.embeddingProcessing,
            ),
            maxProjectionOutstanding: maxOf(
              samples,
              (entry) => entry.projectionPending + entry.projectionProcessing,
            ),
            pendingAtEmbeddingCompletion: embeddingCompletedAt.pending,
            operationalSamples: samples.filter(
              (entry) => entry.operationalStatus === "operational",
            ).length,
            degradedSamples: samples.filter(
              (entry) => entry.operationalStatus === "degraded",
            ).length,
            notReadySamples: samples.filter(
              (entry) => entry.readinessStatus === "not_ready",
            ).length,
            finalPending: finalSample.pending,
            finalProcessing: finalSample.processing,
          },
        };
      };

      const resourceMonitor = startProcessResourceMonitor({
        intervalMs: RESOURCE_POLL_INTERVAL_MS,
        cpuCapacity,
        saturationFraction: CPU_SATURATION_FRACTION,
        eventLoopStallThresholdMs: EVENT_LOOP_STALL_THRESHOLD_MS,
      });
      const startedAt = Date.now();
      let resources: ProcessResourceSnapshot | undefined;
      let phases:
        | { add: FeatureLoadPhaseReport; update: FeatureLoadPhaseReport }
        | undefined;
      let resourceCheckpoints:
        | {
            add: ProcessResourceSnapshot;
            update: ProcessResourceSnapshot;
          }
        | undefined;
      try {
        const add = await runPhase(
          "add",
          (snapshot) => snapshot.completedProbeEmbeddingCalls,
        );
        const addResources = resourceMonitor.snapshot();
        const update = await runPhase(
          "update",
          (snapshot) => snapshot.completedUpdateEmbeddingCalls,
        );
        const updateResources = resourceMonitor.snapshot();
        phases = { add, update };
        resourceCheckpoints = {
          add: addResources,
          update: updateResources,
        };
      } finally {
        resources = await resourceMonitor.stop({
          finalSampleDelayMs: RESOURCE_SETTLE_MS,
        });
        console.info(
          `MOCKED_AI_RESOURCE_REPORT ${JSON.stringify({ cpuCapacity, ...resources })}`,
        );
      }
      const { add, update } = phases;
      const snapshot = tracker.snapshot();
      const report: FeatureLoadReport = {
        importCount: IMPORT_COUNT,
        serviceDelayMs: SERVICE_DELAY_MS,
        durationMs: Date.now() - startedAt,
        cpuCapacity,
        resources,
        resourceCheckpoints,
        ai: snapshot,
        phases,
      };

      console.info(`MOCKED_AI_LOAD_REPORT ${JSON.stringify(report)}`);

      // The dedicated resource lane gives this fixture explicit two-CPU
      // affinity and no concurrent repository suites. The default suite may
      // share a runner with unrelated work, allowing one additional extraction
      // pass while the event loop is externally descheduled.
      const maxObjectCallsPerPhase = resourceAcceptanceEnabled
        ? Math.ceil(IMPORT_COUNT / 4) + 8
        : Math.ceil(IMPORT_COUNT / 2) + 3;
      const assertPhase = (
        phase: FeatureLoadPhaseReport,
        expectedUpdateEmbeddings: number,
      ): void => {
        expect(phase.ai.embeddingCalls).toBeLessThanOrEqual(IMPORT_COUNT + 3);
        expect(phase.ai.probeEmbeddingCalls).toBe(IMPORT_COUNT);
        expect(phase.ai.completedProbeEmbeddingCalls).toBe(IMPORT_COUNT);
        expect(phase.ai.completedUpdateEmbeddingCalls).toBe(
          expectedUpdateEmbeddings,
        );
        expect(phase.ai.objectCalls).toBeGreaterThan(0);
        expect(phase.ai.objectCalls).toBeLessThanOrEqual(
          maxObjectCallsPerPhase,
        );
        expect(phase.queue.maxPending).toBeLessThanOrEqual(IMPORT_COUNT + 3);
        expect(phase.queue.maxProcessing).toBeLessThanOrEqual(4);
        expect(phase.queue.maxEmbeddingOutstanding).toBeLessThanOrEqual(
          IMPORT_COUNT,
        );
        expect(phase.queue.maxProjectionOutstanding).toBeLessThanOrEqual(3);
        // Sampled, not invariant: this is the queue depth at the first 25ms
        // poll that observed every embedding complete, so its absolute value
        // tracks how late that poll landed. A busy runner stretches the poll,
        // more work is admitted in the gap, and the count rises without
        // anything having gone wrong — a hardcoded 3 failed here at 4.
        //
        // The claim worth keeping is a pacing one: embeddings must not finish
        // while a large share of the import is still queued. Expressed as a
        // fraction of the import, that survives poll jitter and still catches
        // the regression it is for, where the count would be in the tens. It
        // also scales with MOCKED_AI_IMPORT_COUNT, which the fixed number
        // silently did not — the same reason maxObjectCallsPerPhase above is
        // derived from IMPORT_COUNT rather than written out.
        expect(phase.queue.pendingAtEmbeddingCompletion).toBeLessThanOrEqual(
          Math.ceil(IMPORT_COUNT / 8),
        );
        expect(phase.queue.operationalSamples).toBeGreaterThan(0);
        expect(phase.queue.degradedSamples).toBe(0);
        expect(phase.queue.notReadySamples).toBe(0);
        expect(phase.queue.finalPending).toBe(0);
        expect(phase.queue.finalProcessing).toBe(0);
      };

      assertPhase(add, 0);
      assertPhase(update, IMPORT_COUNT);
      expect(resources.samples).toBeGreaterThan(1);
      expect(resources.maxCpuCores).toBeGreaterThan(0);
      if (resourceAcceptanceEnabled) {
        expect(resources.maxSustainedCpuSaturationMs).toBeLessThan(
          MAX_SUSTAINED_CPU_SATURATION_MS,
        );
        expect(resources.maxEventLoopDelayMs).toBeLessThan(
          MAX_EVENT_LOOP_DELAY_MS,
        );
        expect(resources.maxSustainedEventLoopDelayMs).toBeLessThan(
          MAX_SUSTAINED_EVENT_LOOP_DELAY_MS,
        );
        expect(resources.maxRssBytes).toBeLessThan(MAX_RSS_BYTES);
        expect(resources.maxRssGrowthBytes).toBeLessThan(MAX_RSS_GROWTH_BYTES);
        expect(resources.finalRssBytes).toBeLessThan(MAX_FINAL_RSS_BYTES);
        expect(resources.finalRssGrowthBytes).toBeLessThan(
          MAX_FINAL_RSS_GROWTH_BYTES,
        );
      }
      expect(snapshot.probeEmbeddingCalls).toBe(IMPORT_COUNT * 2);
      expect(snapshot.completedProbeEmbeddingCalls).toBe(IMPORT_COUNT * 2);
      expect(snapshot.updateEmbeddingCalls).toBe(IMPORT_COUNT);
      expect(snapshot.completedUpdateEmbeddingCalls).toBe(IMPORT_COUNT);
      expect(snapshot.embeddingCalls).toBeLessThanOrEqual(IMPORT_COUNT * 2 + 8);
      expect(snapshot.objectCalls).toBeGreaterThan(0);
      expect(snapshot.objectCalls).toBeLessThanOrEqual(
        maxObjectCallsPerPhase * 2,
      );
      expect(snapshot.activeCalls).toBe(0);
      expect(snapshot.maxConcurrentCalls).toBeGreaterThan(1);
      expect(snapshot.maxConcurrentCalls).toBeLessThanOrEqual(4);
      expect(snapshot.maxConcurrentUpdateEmbeddingCalls).toBeGreaterThan(1);
      expect(snapshot.maxConcurrentUpdateEmbeddingCalls).toBeLessThanOrEqual(4);
    },
    { timeout: IMPORT_TIMEOUT_MS + SETTLE_TIMEOUT_MS * 2 },
  );
});
