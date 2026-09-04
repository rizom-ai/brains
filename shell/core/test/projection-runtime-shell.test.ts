import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  emptyFrontmatterSchema,
  type BaseEntity,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import type {
  IBatchJobManager,
  IJobQueueWorker,
  JobQueueEnqueueRequest,
} from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import {
  createMockJobQueueService,
  createSilentLogger,
} from "@brains/test-utils";
import {
  EntityPlugin,
  defineProjectionRule,
  emptyEntityPluginConfigSchema,
  type ProjectionRule,
} from "@brains/plugins";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import {
  CallbackProgressReporter,
  type IJobProgressMonitor,
} from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { Shell, type ShellDependencies } from "../src/shell";
import { PROJECTION_RULE_JOB_TYPE } from "../src/projection-wave-scheduler";
import { createTestShellConfig } from "./helpers/test-config";
import { createTestDirectory } from "@brains/test-utils";

class ProjectionTargetAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "projection-target",
      purpose: "Projection runtime lifecycle test target.",
      schema: baseEntitySchema,
      frontmatterSchema: emptyFrontmatterSchema,
    });
  }

  override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  fromMarkdown(content: string): Partial<BaseEntity> {
    return { content };
  }
}

const projectionInputSchema = z.object({
  id: z.string(),
  content: z.string().nullable(),
});

class ProjectionTargetPlugin extends EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "projection-target";
  readonly schema = baseEntitySchema;
  readonly adapter = new ProjectionTargetAdapter();

  constructor() {
    super(
      "projection-target",
      { name: "projection-target", version: "1.0.0" },
      {},
      emptyEntityPluginConfigSchema,
    );
  }

  protected override getProjectionRules(): ProjectionRule[] {
    return [
      defineProjectionRule({
        id: "projection-target-rule",
        version: "1",
        sources: [{ kind: "entity", types: ["note"] }],
        targetType: this.entityType,
        inputSchema: projectionInputSchema,
        selectInput: async (trigger, context) => {
          const sourceInput = trigger.inputs.at(-1);
          if (sourceInput === undefined) {
            throw new Error("Projection wave has no source input");
          }
          if (sourceInput.operation === "delete") {
            return { id: sourceInput.sourceId, content: null };
          }
          const source = await context.entities.getEntity({
            entityType: sourceInput.sourceType,
            id: sourceInput.sourceId,
          });
          if (source === null) {
            throw new Error(
              `Projection source ${sourceInput.sourceType}:${sourceInput.sourceId} is missing`,
            );
          }
          return { id: source.id, content: source.content };
        },
        derive: async (input) =>
          input.content === null
            ? [
                {
                  operation: "delete" as const,
                  entityType: "projection-target",
                  id: input.id,
                },
              ]
            : [
                {
                  operation: "upsert" as const,
                  entity: {
                    id: input.id,
                    entityType: "projection-target",
                    content: input.content,
                    metadata: { sourceId: input.id },
                    visibility: "public" as const,
                  },
                },
              ],
      }),
    ];
  }
}

const embeddingService = {
  dimensions: 1536,
  generateEmbedding: async (): Promise<{
    embedding: Float32Array;
    usage: { tokens: number };
  }> => ({
    embedding: new Float32Array(1536),
    usage: { tokens: 0 },
  }),
  generateEmbeddings: async (
    texts: string[],
  ): Promise<{
    embeddings: Float32Array[];
    usage: { tokens: number };
  }> => ({
    embeddings: texts.map(() => new Float32Array(1536)),
    usage: { tokens: 0 },
  }),
};

describe("Shell projection runtime lifecycle", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };
  const shells: Shell[] = [];

  beforeEach(async () => {
    testDir = await createTestDirectory();
    await Promise.all([
      migrateEntities({ url: `file:${testDir.dir}/test.db` }),
      migrateJobQueue({ url: `file:${testDir.dir}/test-jobs.db` }),
      migrateConversations({ url: `file:${testDir.dir}/test-conv.db` }),
      migrateRuntimeState({
        url: `file:${testDir.dir}/test-runtime-state.db`,
      }),
    ]);
  });

  afterEach(async () => {
    for (const activeShell of shells.splice(0).reverse()) {
      await activeShell.shutdown();
    }
    await testDir.cleanup();
  });

  async function shutdownTracked(shell: Shell): Promise<void> {
    await shell.shutdown();
    const index = shells.indexOf(shell);
    if (index >= 0) shells.splice(index, 1);
  }

  async function projectedContent(shell: Shell): Promise<string | null> {
    const target = await shell.getEntityService().getEntity({
      entityType: "projection-target",
      id: "source-note",
    });
    return target?.content ?? null;
  }

  async function waitForProjectedContent(
    shell: Shell,
    expected: string | null,
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    let lastContent: string | null = null;
    while (Date.now() < deadline) {
      lastContent = await projectedContent(shell);
      if (lastContent === expected) return;
      await Bun.sleep(20);
    }
    throw new Error(
      `Projection target did not converge to ${JSON.stringify(expected)}; last content was ${JSON.stringify(lastContent)}`,
    );
  }

  it("wakes the scheduler from a committed entity mutation", async () => {
    const requests: JobQueueEnqueueRequest[] = [];
    const queue = createMockJobQueueService();
    Object.defineProperty(queue, "close", { value: () => {} });
    queue.enqueue = mock(async (request): Promise<string> => {
      requests.push(request);
      return `job-${requests.length}`;
    });
    let workerRunning = false;
    const worker: IJobQueueWorker = {
      start: async () => {
        workerRunning = true;
      },
      stop: async () => {
        workerRunning = false;
      },
      isWorkerRunning: () => workerRunning,
      getStats: () => ({
        processedJobs: 0,
        failedJobs: 0,
        activeJobs: 0,
        uptime: 0,
        isRunning: workerRunning,
        isHealthy: true,
      }),
    };
    const reporter = CallbackProgressReporter.from(async () => {});
    if (!reporter) throw new Error("Failed to create progress reporter");
    const progressMonitor: IJobProgressMonitor = {
      start: () => {},
      stop: () => {},
      createProgressReporter: () => reporter,
      emitJobCompletion: async () => {},
      emitJobFailure: async () => {},
      handleJobStatusChange: async () => {},
    };
    const batchManager: IBatchJobManager = {
      start: () => {},
      stop: () => {},
      registerBatch: () => {},
      enqueueBatch: async () => "batch-1",
      getBatchStatus: async () => null,
      getActiveBatches: async () => [],
    };
    const dependencies: ShellDependencies = {
      logger: createSilentLogger(),
      embeddingService,
      jobQueueService: queue,
      jobQueueWorker: worker,
      jobProgressMonitor: progressMonitor,
      batchJobManager: batchManager,
    };
    const config = createTestShellConfig(testDir.dir);
    config.plugins = [new ProjectionTargetPlugin()];
    const shell = Shell.createFresh(config, dependencies);
    shells.push(shell);
    await shell.initialize();

    await shell.getEntityService().createEntity({
      entity: {
        id: "source-note",
        entityType: "note",
        content: "Projection source",
        metadata: {},
      },
    });

    expect(queue.registerHandler).toHaveBeenCalledWith(
      PROJECTION_RULE_JOB_TYPE,
      expect.any(Object),
      "shell",
    );
    expect(
      requests.filter((request) => request.type === PROJECTION_RULE_JOB_TYPE),
    ).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: "projection-target-rule" }),
      }),
    ]);
  });

  it("replays stopped-worker updates and deletes after each restart", async () => {
    const config = createTestShellConfig(testDir.dir, {
      plugins: [new ProjectionTargetPlugin()],
      embedding: { enabled: false },
    });
    const web = Shell.createFresh(
      config,
      { logger: createSilentLogger(), embeddingService },
      { processRole: "web" },
    );
    shells.push(web);
    await web.initialize();

    const startWorker = async (): Promise<Shell> => {
      const worker = Shell.createFresh(
        config,
        { logger: createSilentLogger(), embeddingService },
        { processRole: "worker" },
      );
      shells.push(worker);
      await worker.initialize();
      return worker;
    };

    await web.getEntityService().createEntity({
      entity: {
        id: "source-note",
        entityType: "note",
        content: "first revision",
        metadata: {},
      },
    });
    let worker = await startWorker();
    await waitForProjectedContent(web, "first revision");
    expect(await projectedContent(web)).toBe("first revision");
    await shutdownTracked(worker);

    const source = await web.getEntityService().getEntity({
      entityType: "note",
      id: "source-note",
    });
    if (source === null) throw new Error("Projection source is missing");
    await web.getEntityService().updateEntity({
      entity: { ...source, content: "second revision" },
    });
    worker = await startWorker();
    await waitForProjectedContent(web, "second revision");
    expect(await projectedContent(web)).toBe("second revision");
    await shutdownTracked(worker);

    await web.getEntityService().deleteEntity({
      entityType: "note",
      id: "source-note",
    });
    await startWorker();
    await waitForProjectedContent(web, null);
    expect(await projectedContent(web)).toBeNull();
  }, 30_000);
});
