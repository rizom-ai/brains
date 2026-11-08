import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AIGenerationSchema } from "@brains/ai-service";
import { MigrationManager, resolve } from "@brains/app";
import { Shell } from "@brains/core";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { waitUntil } from "@brains/test-utils";
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
const QUIET_MS = 100;
// Each wait gets a budget well under the test timeout, so a wait that cannot
// settle fails by name with the work still queued instead of timing out bare.
const SETTLE_BUDGET_MS = 10_000;
const TIMEOUT_MS = 30_000;
const EXTRACTION_JOB_TYPE = "topics:extract";
// The worker polls every 100ms: a due job is claimed well within this.
const CLAIM_GRACE_MS = 1_000;
const WAIT_OPTIONS = { timeoutMs: SETTLE_BUDGET_MS, intervalMs: 25 };

type DirectorySync = NonNullable<
  ReturnType<DirectorySyncPlugin["getDirectorySync"]>
>;
type JobQueue = ReturnType<Shell["getJobQueueService"]>;
type EntityService = ReturnType<Shell["getEntityService"]>;

interface Brain {
  dataDir: string;
  directorySync: DirectorySync;
  entityService: EntityService;
  queue: JobQueue;
  /** Wait for the queue to settle, naming the wait and what is outstanding. */
  settle(label: string): Promise<void>;
}

/** Holds topic vote calls while held, so one extraction stays in flight. */
class HeldVoteAIService extends MockLoadAIService {
  private gate: Promise<void> | undefined;
  voteHeld = false;

  hold(): () => void {
    const release = deferred();
    this.gate = release.promise;
    return (): void => {
      this.gate = undefined;
      release.resolve();
    };
  }

  override async generateObject<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: AIGenerationSchema<T>,
    signal?: AbortSignal,
  ): Promise<{
    object: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    if (this.gate && userPrompt.includes("Source key:")) {
      this.voteHeld = true;
      await this.gate;
    }
    return super.generateObject(systemPrompt, userPrompt, schema, signal);
  }
}

function noteId(index: number): string {
  return `projection-causality-${index.toString().padStart(4, "0")}`;
}

async function writeNote(dataDir: string, index: number): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, `${noteId(index)}.md`),
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
}

function readsOnce(indexes: readonly number[]): Record<string, number> {
  return Object.fromEntries(
    indexes.map((index) => [`note:${noteId(index)}`, 1]),
  );
}

async function outstandingWork(queue: JobQueue): Promise<string> {
  const now = Date.now();
  const jobs = await queue.getActiveJobs();
  if (jobs.length === 0) return "nothing outstanding";
  return jobs
    .map((job) =>
      job.status === "processing"
        ? `${job.type} processing for ${now - (job.startedAt ?? now)}ms`
        : `${job.type} pending, due in ${job.scheduledFor - now}ms`,
    )
    .join("; ");
}

/**
 * A job the worker must not claim leaves no trace, so only elapsed time can
 * show it was left alone: wait until it has been due for the claim grace.
 */
async function giveWorkerTimeToClaim(dueAt: number): Promise<void> {
  const wait = dueAt + CLAIM_GRACE_MS - Date.now();
  await Bun.sleep(Math.min(SETTLE_BUDGET_MS, Math.max(0, wait)));
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

  async function startBrain(
    tracker: MockLoadTracker,
    createAIService: (operationContext: OperationContext) => MockLoadAIService,
  ): Promise<Brain> {
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

    const operationContext = OperationContext.createFresh();
    const aiService = createAIService(operationContext);
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

    const runningShell = Shell.createFresh(
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
        ...(resolved.profileKind ? { profileKind: resolved.profileKind } : {}),
        ...(resolved.agentInstructions
          ? { agentInstructions: resolved.agentInstructions }
          : {}),
      },
      { logger, aiService, embeddingService, operationContext },
    );
    shell = runningShell;
    // The startup sync is queued; its defaults follow once it settles.
    let startupContentSettled = false;
    runningShell
      .getMessageBus()
      .subscribe(SYSTEM_CHANNELS.startupContentSettled, async () => {
        startupContentSettled = true;
        return { success: true };
      });
    await runningShell.initialize();
    const queue = runningShell.getJobQueueService();
    const settle = async (label: string): Promise<void> => {
      try {
        await queue.waitForIdle({
          quietMs: QUIET_MS,
          timeoutMs: SETTLE_BUDGET_MS,
        });
      } catch (error) {
        throw new Error(
          `The ${label} wait did not settle within ${SETTLE_BUDGET_MS}ms: ${await outstandingWork(queue)}`,
          { cause: error },
        );
      }
    };

    const directoryPlugin = runningShell
      .getPluginManager()
      .getPlugin("directory-sync");
    if (!(directoryPlugin instanceof DirectorySyncPlugin)) {
      throw new Error("Directory sync plugin was not registered");
    }
    const directorySync = directoryPlugin.getDirectorySync();
    if (!directorySync) throw new Error("Directory sync was not initialized");

    // Settle any startup ingress before collecting phase evidence.
    await waitUntil(
      () => startupContentSettled,
      "startup content to settle",
      WAIT_OPTIONS,
    );
    await settle("startup");
    return {
      dataDir,
      directorySync,
      entityService: runningShell.getEntityService(),
      queue,
      settle,
    };
  }

  it(
    "reads each source of an import burst split by a pause exactly once",
    async () => {
      const tracker = new MockLoadTracker();
      const { dataDir, directorySync, entityService, settle } =
        await startBrain(
          tracker,
          (operationContext) =>
            new MockLoadAIService(tracker, {
              delayMs: 0,
              getProjectionId: (): string | undefined =>
                operationContext.current()?.provenance.projectionId,
            }),
        );
      const baseline = tracker.snapshot();
      const indexes = Array.from({ length: IMPORT_COUNT }, (_unused, i) => i);
      await Promise.all(indexes.map((index) => writeNote(dataDir, index)));

      const originalUpsert = entityService.upsertEntity.bind(entityService);
      let mutationCount = 0;
      // Pause the burst until the extraction it woke has settled.
      entityService.upsertEntity = (async (
        request: Parameters<typeof originalUpsert>[0],
      ): ReturnType<typeof originalUpsert> => {
        const result = await originalUpsert(request);
        mutationCount++;
        if (mutationCount === SPLIT_AFTER) await settle("split");
        return result;
      }) satisfies typeof originalUpsert;

      try {
        const result = await directorySync.sync();
        expect(result.import.failed).toBe(0);
        expect(result.import.imported).toBe(IMPORT_COUNT);
      } finally {
        entityService.upsertEntity = originalUpsert;
      }

      await settle("final");

      // A burst split by a pause wakes extraction more than once, but each
      // imported source costs one vote read and settled sources none.
      expect(
        diffCounts(baseline.sourceReads, tracker.snapshot().sourceReads),
      ).toEqual(readsOnce(indexes));
    },
    TIMEOUT_MS,
  );

  it(
    "runs an extraction woken during another one as soon as that one ends",
    async () => {
      const tracker = new MockLoadTracker();
      const ai = new HeldVoteAIService(tracker, { delayMs: 0 });
      const { dataDir, directorySync, queue, settle } = await startBrain(
        tracker,
        () => ai,
      );
      const baseline = tracker.snapshot();

      // The first note wakes an extraction, held while it reads the note.
      const release = ai.hold();
      await writeNote(dataDir, 0);
      expect((await directorySync.sync()).import.imported).toBe(1);
      await waitUntil(
        () => ai.voteHeld,
        "the first extraction to read the note",
        WAIT_OPTIONS,
      );

      // A second note wakes a successor while the first still runs. Give the
      // worker time to claim it once due: it must wait for the first.
      await writeNote(dataDir, 1);
      expect((await directorySync.sync()).import.imported).toBe(1);
      const successor = (await queue.getActiveJobs([EXTRACTION_JOB_TYPE])).find(
        (job) => job.status === "pending",
      );
      if (!successor) {
        throw new Error(
          `No extraction was queued behind the held one: ${await outstandingWork(queue)}`,
        );
      }
      await giveWorkerTimeToClaim(successor.scheduledFor);

      release();
      await settle("successor");

      expect(
        diffCounts(baseline.sourceReads, tracker.snapshot().sourceReads),
      ).toEqual(readsOnce([0, 1]));
    },
    TIMEOUT_MS,
  );
});
