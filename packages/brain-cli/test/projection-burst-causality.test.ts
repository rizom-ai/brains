import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MigrationManager, resolve } from "@brains/app";
import {
  Shell,
  type ProjectionRuleDiagnostic,
  type ProjectionRuntimeControls,
} from "@brains/core";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import { OperationContext } from "@brains/operation-context";
import { Logger, LogLevel } from "@brains/utils/logger";
import { canonicalBrain } from "../src/model/canonical-brain";
import {
  MOCK_LOAD_API_KEY,
  MOCK_LOAD_MODEL,
  MOCK_LOAD_PROBE_MARKER,
  MockLoadAIService,
  MockLoadEmbeddingService,
  MockLoadTracker,
} from "./helpers/mocked-ai-load-services";

const IMPORT_COUNT = 40;
const SPLIT_AFTER = 20;
const TOPIC_BATCH_DELAY_MS = 1_000;
const QUIET_MS = 100;
const TIMEOUT_MS = 30_000;

interface ScheduledWakeup {
  readyAt: number;
  wakeup: () => Promise<void>;
  cancelled: boolean;
}

class VirtualProjectionClock {
  private current = 10_000;
  private readonly wakeups: ScheduledWakeup[] = [];

  readonly now = (): number => this.current;

  readonly scheduleWakeup: NonNullable<
    ProjectionRuntimeControls["scheduleWakeup"]
  > = (delayMs, wakeup) => {
    const scheduled: ScheduledWakeup = {
      readyAt: this.current + delayMs,
      wakeup,
      cancelled: false,
    };
    this.wakeups.push(scheduled);
    return (): void => {
      scheduled.cancelled = true;
    };
  };

  async advanceBy(durationMs: number): Promise<void> {
    this.current += durationMs;
    let due = this.nextDueWakeup();
    while (due) {
      due.cancelled = true;
      await due.wakeup();
      due = this.nextDueWakeup();
    }
  }

  private nextDueWakeup(): ScheduledWakeup | undefined {
    return this.wakeups
      .filter(
        (scheduled) =>
          !scheduled.cancelled && scheduled.readyAt <= this.current,
      )
      .sort((left, right) => left.readyAt - right.readyAt)[0];
  }
}

async function writeNotes(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await Promise.all(
    Array.from({ length: IMPORT_COUNT }, async (_unused, index) => {
      const id = `projection-causality-${index.toString().padStart(4, "0")}`;
      await writeFile(
        join(dataDir, `${id}.md`),
        [
          "---",
          `title: ${MOCK_LOAD_PROBE_MARKER} ${index}`,
          "tags:",
          "  - projection-causality",
          "---",
          "",
          `${MOCK_LOAD_PROBE_MARKER} ${index}`,
          "",
          `Deterministic projection causality content ${index}.`,
          "",
        ].join("\n"),
        "utf8",
      );
    }),
  );
}

function projectionCalls(
  snapshot: ReturnType<MockLoadTracker["snapshot"]>,
  projectionId: string,
): number {
  return snapshot.objectCallsByProjection[projectionId] ?? 0;
}

describe("projection burst causal evidence", () => {
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
    "coalesces a producer pause longer than the quiet window into one topic wave",
    async () => {
      tempRoot = await mkdtemp(join(tmpdir(), "projection-causality-"));
      const dataDir = join(tempRoot, "brain-data");

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

      const clock = new VirtualProjectionClock();
      const operationContext = OperationContext.createFresh();
      const tracker = new MockLoadTracker();
      const diagnostics: ProjectionRuleDiagnostic[] = [];
      const aiService = new MockLoadAIService(tracker, {
        delayMs: 0,
        getProjectionId: (): string | undefined =>
          operationContext.current()?.provenance.projectionId,
      });
      const embeddingService = new MockLoadEmbeddingService(tracker, {
        delayMs: 0,
        dimensions: 1536,
      });
      const resolved = resolve(
        canonicalBrain,
        {},
        {
          name: "Projection burst causality",
          bundleContract: "capability-bundles-v1",
          bundles: ["core"],
          remove: [
            "atproto-registry",
            "auth-service",
            "notifications",
            "playbook",
            "playbooks",
            "onboarding",
            "email",
            "studio",
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
          ai: { apiKey: MOCK_LOAD_API_KEY, model: MOCK_LOAD_MODEL },
          embedding: { enabled: true },
          logging: { level: "error", context: "projection-causality" },
          ...(resolved.identity ? { identity: resolved.identity } : {}),
          ...(resolved.profileKind
            ? { profileKind: resolved.profileKind }
            : {}),
          ...(resolved.agentInstructions
            ? { agentInstructions: resolved.agentInstructions }
            : {}),
        },
        {
          logger,
          aiService,
          embeddingService,
          operationContext,
          projectionRuntime: {
            now: clock.now,
            scheduleWakeup: clock.scheduleWakeup,
            onDiagnostic: (diagnostic): void => {
              diagnostics.push(diagnostic);
            },
          },
        },
      );
      const runningShell = shell;
      await runningShell.initialize();
      const queue = runningShell.getJobQueueService();

      // Settle any startup ingress before collecting phase evidence.
      await clock.advanceBy(TOPIC_BATCH_DELAY_MS + 1);
      await queue.waitForIdle({ quietMs: QUIET_MS, timeoutMs: TIMEOUT_MS });
      const baseline = tracker.snapshot();
      const baselineTopicSourceCount =
        diagnostics
          .filter(
            (entry) =>
              entry.ruleId === "topics-projection" &&
              entry.event === "input-selected",
          )
          .at(-1)?.selectedSourceCount ?? 0;
      const diagnosticStart = diagnostics.length;
      await writeNotes(dataDir);

      const directoryPlugin = runningShell
        .getPluginManager()
        .getPlugin("directory-sync");
      if (!(directoryPlugin instanceof DirectorySyncPlugin)) {
        throw new Error("Directory sync plugin was not registered");
      }
      const directorySync = directoryPlugin.getDirectorySync();
      if (!directorySync) throw new Error("Directory sync was not initialized");

      const entityService = runningShell.getEntityService();
      const originalUpsert = entityService.upsertEntity.bind(entityService);
      let mutationCount = 0;
      entityService.upsertEntity = (async (
        request: Parameters<typeof originalUpsert>[0],
      ) => {
        const result = await originalUpsert(request);
        mutationCount++;
        if (mutationCount === SPLIT_AFTER) {
          await clock.advanceBy(TOPIC_BATCH_DELAY_MS + 1);
          await queue.waitForIdle({
            quietMs: QUIET_MS,
            timeoutMs: TIMEOUT_MS,
          });
        }
        return result;
      }) as typeof entityService.upsertEntity;

      try {
        const result = await directorySync.sync();
        expect(result.import.failed).toBe(0);
        expect(result.import.imported).toBe(IMPORT_COUNT);
      } finally {
        entityService.upsertEntity = originalUpsert;
      }

      await clock.advanceBy(TOPIC_BATCH_DELAY_MS + 1);
      await queue.waitForIdle({ quietMs: QUIET_MS, timeoutMs: TIMEOUT_MS });

      const phaseDiagnostics = diagnostics.slice(diagnosticStart);
      const topicDerives = phaseDiagnostics.filter(
        (entry) =>
          entry.ruleId === "topics-projection" &&
          entry.event === "derive-started",
      );
      const selectedTopicInputs = phaseDiagnostics.filter(
        (entry) =>
          entry.ruleId === "topics-projection" &&
          entry.event === "input-selected",
      );
      const topicApplyOutcomes = phaseDiagnostics.filter(
        (entry) =>
          entry.ruleId === "topics-projection" &&
          entry.event === "apply-completed",
      );
      const after = tracker.snapshot();

      expect(new Set(topicDerives.map(({ waveId }) => waveId)).size).toBe(1);
      expect(topicDerives.map(({ attemptNumber }) => attemptNumber)).toEqual([
        1,
      ]);
      expect(
        selectedTopicInputs.map(
          ({ selectedSourceCount }) => selectedSourceCount,
        ),
      ).toEqual([baselineTopicSourceCount + IMPORT_COUNT]);
      expect(
        topicApplyOutcomes.map(({ applyOutcome }) => applyOutcome),
      ).toEqual(["applied"]);
      expect(
        projectionCalls(after, "topics-projection") -
          projectionCalls(baseline, "topics-projection"),
      ).toBe(
        selectedTopicInputs.reduce(
          (calls, entry) =>
            calls + Math.ceil((entry.selectedSourceCount ?? 0) / 4),
          0,
        ),
      );
    },
    TIMEOUT_MS,
  );
});
