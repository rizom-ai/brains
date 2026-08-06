import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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
  ProgressReporter,
  type IJobProgressMonitor,
} from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { Shell, type ShellDependencies } from "../src/shell";
import { PROJECTION_RULE_JOB_TYPE } from "../src/projection-wave-scheduler";
import { createTestShellConfig } from "./helpers/test-config";
import { createTestDirectory } from "./helpers/test-db";

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
        inputSchema: z.object({}),
        selectInput: async () => ({}),
        derive: async () => [],
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
  let shell: Shell;

  beforeEach(async () => {
    testDir = await createTestDirectory();
    await migrateEntities({ url: `file:${testDir.dir}/test.db` });
    await migrateRuntimeState({
      url: `file:${testDir.dir}/test-runtime-state.db`,
    });
  });

  afterEach(async () => {
    await shell.shutdown();
    await testDir.cleanup();
  });

  it("wakes the scheduler from a committed entity mutation", async () => {
    const requests: JobQueueEnqueueRequest[] = [];
    const queue = createMockJobQueueService();
    Object.defineProperty(queue, "close", { value: () => {} });
    queue.enqueue = mock(async (request): Promise<string> => {
      requests.push(request);
      return `job-${requests.length}`;
    });
    queue.registerHandler = mock(() => {});
    queue.unregisterHandler = mock(() => {});

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
    const reporter = ProgressReporter.from(async () => {});
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
    shell = Shell.createFresh(config, dependencies);
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
});
