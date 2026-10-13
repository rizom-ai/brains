import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MigrationManager, resolve } from "@brains/app";
import { Shell, type ProjectionRuntimeControls } from "@brains/core";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { deferred } from "@brains/utils/deferred";
import { OperationContext } from "@brains/operation-context";
import { ConsoleLogger, LogLevel } from "@brains/utils/logger";
import { canonicalBrain } from "../src/model/canonical-brain";
import {
  MOCK_LOAD_API_KEY,
  MOCK_LOAD_MODEL,
  MOCK_LOAD_PROBE_MARKER,
  MockLoadAIService,
  MockLoadEmbeddingService,
  MockLoadTracker,
  diffCounts,
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
    ConsoleLogger.resetInstance();
  });

  it(
    "reads each source of an import burst split by a pause exactly once",
    async () => {
      tempRoot = await mkdtemp(join(tmpdir(), "projection-causality-"));
      const dataDir = join(tempRoot, "brain-data");

      const logger = ConsoleLogger.getInstance({ level: LogLevel.ERROR });
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
          },
        },
      );
      const runningShell = shell;
      // The startup sync is queued; its defaults follow once it settles.
      const startupContent = deferred();
      runningShell
        .getMessageBus()
        .subscribe(SYSTEM_CHANNELS.startupContentSettled, async () => {
          startupContent.resolve();
          return { success: true };
        });
      await runningShell.initialize();
      const queue = runningShell.getJobQueueService();

      // Settle any startup ingress before collecting phase evidence.
      await startupContent.promise;
      await clock.advanceBy(TOPIC_BATCH_DELAY_MS + 1);
      await queue.waitForIdle({ quietMs: QUIET_MS, timeoutMs: TIMEOUT_MS });
      const baseline = tracker.snapshot();
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
      ): ReturnType<typeof originalUpsert> => {
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
      }) satisfies typeof originalUpsert;

      try {
        const result = await directorySync.sync();
        expect(result.import.failed).toBe(0);
        expect(result.import.imported).toBe(IMPORT_COUNT);
      } finally {
        entityService.upsertEntity = originalUpsert;
      }

      await clock.advanceBy(TOPIC_BATCH_DELAY_MS + 1);
      await queue.waitForIdle({ quietMs: QUIET_MS, timeoutMs: TIMEOUT_MS });

      const phaseReads = diffCounts(
        baseline.sourceReads,
        tracker.snapshot().sourceReads,
      );
      // A burst split by a pause wakes extraction more than once, but each
      // imported source costs one vote read and settled sources none.
      expect(phaseReads).toEqual(
        Object.fromEntries(
          Array.from({ length: IMPORT_COUNT }, (_unused, index) => [
            `note:projection-causality-${index.toString().padStart(4, "0")}`,
            1,
          ]),
        ),
      );
    },
    TIMEOUT_MS,
  );
});
