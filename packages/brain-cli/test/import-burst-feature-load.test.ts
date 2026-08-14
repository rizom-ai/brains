import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Shell } from "@brains/core";
import { MigrationManager, resolve } from "@brains/app";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import { Logger, LogLevel } from "@brains/utils/logger";
import { canonicalBrain } from "../src/model/canonical-brain";
import {
  MOCK_LOAD_API_KEY,
  MOCK_LOAD_MODEL,
  MOCK_LOAD_PROBE_MARKER,
  MockLoadAIService,
  MockLoadEmbeddingService,
  MockLoadTracker,
  type MockLoadSnapshot,
} from "./helpers/mocked-ai-load-services";

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
  completedProbeEmbeddings: number;
}

interface FeatureLoadReport {
  importCount: number;
  serviceDelayMs: number;
  durationMs: number;
  ai: MockLoadSnapshot;
  queue: {
    samples: number;
    maxPending: number;
    maxProcessing: number;
    maxEmbeddingOutstanding: number;
    maxProjectionOutstanding: number;
    pendingAtProbeCompletion: number;
    operationalSamples: number;
    degradedSamples: number;
    notReadySamples: number;
    finalPending: number;
    finalProcessing: number;
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
        "",
      ].join("\n"),
      "utf8",
    );
  }
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
  });

  it(
    "keeps AI concurrency bounded, queue growth finite, and health observable",
    async () => {
      if (!Number.isInteger(IMPORT_COUNT) || IMPORT_COUNT < 1) {
        throw new Error("MOCKED_AI_IMPORT_COUNT must be a positive integer");
      }
      if (!Number.isFinite(SERVICE_DELAY_MS) || SERVICE_DELAY_MS < 0) {
        throw new Error("MOCKED_AI_SERVICE_DELAY_MS must be non-negative");
      }

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

      const logger = Logger.createFresh({ level: LogLevel.ERROR });
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
              sourceChangeBatchDelayMs: 0,
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
          completedProbeEmbeddings:
            tracker.snapshot().completedProbeEmbeddingCalls,
        };
        samples.push(current);
        return current;
      };

      await writeImportedNotes(dataDir, IMPORT_COUNT);
      const directoryPlugin = runningShell
        .getPluginManager()
        .getPlugin("directory-sync");
      if (!(directoryPlugin instanceof DirectorySyncPlugin)) {
        throw new Error("Directory sync plugin was not registered");
      }
      const directorySync = directoryPlugin.getDirectorySync();
      if (!directorySync) throw new Error("Directory sync was not initialized");

      // Sample across the burst itself, not just the drain that follows it.
      const sampler = startSampler(POLL_INTERVAL_MS, sample);
      const startedAt = Date.now();
      const importResult = await directorySync.sync();
      expect(importResult.import.failed).toBe(0);
      expect(importResult.import.imported).toBe(IMPORT_COUNT);

      await queue.waitForIdle({
        quietMs: QUIET_MS,
        timeoutMs: SETTLE_TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
      });
      await sampler.stop();
      const finalSample = await sample();
      const snapshot = tracker.snapshot();
      const probeCompletedAt = samples.find(
        (entry) => entry.completedProbeEmbeddings >= IMPORT_COUNT,
      );
      if (!probeCompletedAt)
        throw new Error("Probe completion was not sampled");

      const report: FeatureLoadReport = {
        importCount: IMPORT_COUNT,
        serviceDelayMs: SERVICE_DELAY_MS,
        durationMs: Date.now() - startedAt,
        ai: snapshot,
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
          pendingAtProbeCompletion: probeCompletedAt.pending,
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

      console.info(`MOCKED_AI_LOAD_REPORT ${JSON.stringify(report)}`);

      expect(snapshot.probeEmbeddingCalls).toBe(IMPORT_COUNT);
      expect(snapshot.completedProbeEmbeddingCalls).toBe(IMPORT_COUNT);
      expect(snapshot.embeddingCalls).toBeLessThanOrEqual(IMPORT_COUNT + 8);
      expect(snapshot.objectCalls).toBeGreaterThan(0);
      expect(snapshot.objectCalls).toBeLessThanOrEqual(
        Math.ceil(IMPORT_COUNT / 4) + 8,
      );
      expect(snapshot.activeCalls).toBe(0);
      expect(snapshot.maxConcurrentCalls).toBeLessThanOrEqual(1);
      expect(report.queue.maxPending).toBeLessThanOrEqual(IMPORT_COUNT + 3);
      expect(report.queue.maxProcessing).toBeLessThanOrEqual(1);
      expect(report.queue.maxEmbeddingOutstanding).toBeLessThanOrEqual(
        IMPORT_COUNT,
      );
      expect(report.queue.maxProjectionOutstanding).toBeLessThanOrEqual(3);
      expect(report.queue.pendingAtProbeCompletion).toBeLessThanOrEqual(3);
      expect(report.queue.operationalSamples).toBeGreaterThan(0);
      expect(report.queue.degradedSamples).toBe(0);
      expect(report.queue.notReadySamples).toBe(0);
      expect(report.queue.finalPending).toBe(0);
      expect(report.queue.finalProcessing).toBe(0);
    },
    { timeout: IMPORT_TIMEOUT_MS + SETTLE_TIMEOUT_MS * 2 },
  );
});
