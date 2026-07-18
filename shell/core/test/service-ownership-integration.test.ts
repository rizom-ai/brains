import { afterEach, describe, expect, it } from "bun:test";
import type { IEmbeddingService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { JobQueueService } from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import type { Plugin } from "@brains/plugins";
import { RECURRING_CHECK_JOB_TYPE } from "@brains/recurring-checks";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type { ShellConfigInput } from "../src/config";
import { Shell, type ShellDependencies } from "../src/shell";
import { createTestDirectory } from "./helpers/test-db";

interface TestDirectory {
  dir: string;
  cleanup(): Promise<void>;
}

interface ShellIoRecord {
  entityId: string;
  conversationId: string;
  runtimeKey: string;
  jobId: string;
}

const logger = createSilentLogger("service-ownership-integration");

const embeddingService: IEmbeddingService = {
  dimensions: 1536,
  generateEmbedding: async () => ({
    embedding: new Float32Array(1536).fill(0.1),
    usage: { tokens: 1 },
  }),
  generateEmbeddings: async (texts) => ({
    embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
    usage: { tokens: texts.length },
  }),
};

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/entities.db` },
    embeddingDatabase: { url: `file:${dir}/embeddings.db` },
    jobQueueDatabase: { url: `file:${dir}/jobs.db` },
    conversationDatabase: { url: `file:${dir}/conversations.db` },
    runtimeStateDatabase: { url: `file:${dir}/runtime-state.db` },
    ai: {
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    },
    logging: { level: "error" },
  };
}

function defaultDependencies(): ShellDependencies {
  return { logger, embeddingService };
}

async function migrateTestDatabases(dir: string): Promise<void> {
  await migrateEntities({ url: `file:${dir}/entities.db` });
  await migrateJobQueue({ url: `file:${dir}/jobs.db` });
  await migrateConversations({ url: `file:${dir}/conversations.db` });
  await migrateRuntimeState({ url: `file:${dir}/runtime-state.db` });
}

async function writeAndReadShellState(
  shell: Shell,
  label: string,
): Promise<ShellIoRecord> {
  const entityId = `${label}-entity`;
  const conversationId = `${label}-conversation`;
  const runtimeKey = `${label}-runtime`;

  await shell.getEntityService().createEntity({
    entity: {
      id: entityId,
      entityType: "note",
      content: `${label} entity content`,
      metadata: { label },
    },
  });

  const startedConversationId = await shell
    .getConversationService()
    .startConversation({
      sessionId: conversationId,
      interfaceType: "test",
      channelId: `${label}-channel`,
      metadata: {
        channelName: `${label} channel`,
        interfaceType: "test",
        channelId: `${label}-channel`,
      },
    });
  await shell.getConversationService().addMessage({
    conversationId: startedConversationId,
    role: "user",
    content: `${label} conversation content`,
  });

  const runtimeState = shell.getRuntimeState().scoped({
    namespace: "service-ownership.integration",
    schema: z.string(),
  });
  await runtimeState.set(runtimeKey, `${label} runtime value`);

  const jobType = `test:ownership:${label}`;
  shell.getJobQueueService().registerHandler(
    jobType,
    {
      validateAndParse: (data) => data,
      process: (data) => Promise.resolve(data),
    },
    "service-ownership-integration",
  );
  const jobId = await shell.getJobQueueService().enqueue({
    type: jobType,
    data: { label },
    options: {
      delayMs: 3_600_000,
      source: "service-ownership-integration",
      metadata: {
        operationType: "data_processing",
        silent: true,
      },
    },
  });

  const [entity, messages, runtimeValue, job] = await Promise.all([
    shell.getEntityService().getEntity({ entityType: "note", id: entityId }),
    shell.getConversationService().getMessages(startedConversationId),
    runtimeState.get(runtimeKey),
    shell.getJobQueueService().getStatus(jobId),
  ]);

  expect(entity?.content).toBe(`${label} entity content`);
  expect(messages.map((message) => message.content)).toEqual([
    `${label} conversation content`,
  ]);
  expect(runtimeValue).toBe(`${label} runtime value`);
  expect(job?.status).toBe("pending");

  return {
    entityId,
    conversationId: startedConversationId,
    runtimeKey,
    jobId,
  };
}

async function expectClientClosed(operation: Promise<unknown>): Promise<void> {
  let receivedError: unknown;
  try {
    await operation;
  } catch (error) {
    receivedError = error;
  }

  const errorText =
    String(receivedError) +
    (receivedError instanceof Error && receivedError.cause
      ? String(receivedError.cause)
      : "");
  expect(errorText).toContain("CLIENT_CLOSED");
}

async function shutdownIgnoringFailure(shell: Shell): Promise<void> {
  try {
    await shell.shutdown();
  } catch {
    // Preserve the test's primary assertion while still settling cleanup.
  }
}

describe("Shell service ownership integration", () => {
  const directories: TestDirectory[] = [];
  const shells: Shell[] = [];

  afterEach(async () => {
    for (const shell of shells.splice(0).reverse()) {
      await shutdownIgnoringFailure(shell);
    }
    for (const directory of directories.splice(0).reverse()) {
      await directory.cleanup();
    }
  });

  async function createDirectory(): Promise<TestDirectory> {
    const directory = await createTestDirectory();
    directories.push(directory);
    return directory;
  }

  it("runs two persistent no-interface shells without sharing service state", async () => {
    const directoryA = await createDirectory();
    const directoryB = await createDirectory();
    await migrateTestDatabases(directoryA.dir);
    await migrateTestDatabases(directoryB.dir);

    const configA = createTestConfig(directoryA.dir);
    const configB = createTestConfig(directoryB.dir);
    const shellA = Shell.createFresh(configA, defaultDependencies());
    const shellB = Shell.createFresh(configB, defaultDependencies());
    shells.push(shellA, shellB);

    await shellA.initialize();
    await shellB.initialize();

    const recordA = await writeAndReadShellState(shellA, "shell-a-first");
    const recordB = await writeAndReadShellState(shellB, "shell-b-first");
    const runtimeA = shellA.getRuntimeState().scoped({
      namespace: "service-ownership.integration",
      schema: z.string(),
    });
    const runtimeB = shellB.getRuntimeState().scoped({
      namespace: "service-ownership.integration",
      schema: z.string(),
    });

    expect(
      await shellA.getEntityService().getEntity({
        entityType: "note",
        id: recordB.entityId,
      }),
    ).toBeNull();
    expect(
      await shellB
        .getConversationService()
        .getConversation(recordA.conversationId),
    ).toBeNull();
    expect(await runtimeA.get(recordB.runtimeKey)).toBeNull();
    expect(await runtimeB.get(recordA.runtimeKey)).toBeNull();
    expect(
      await shellA.getJobQueueService().getStatus(recordB.jobId),
    ).toBeNull();
    expect(
      await shellB.getJobQueueService().getStatus(recordA.jobId),
    ).toBeNull();

    expect(shellA.getJobQueueService().getRegisteredTypes()).toContain(
      RECURRING_CHECK_JOB_TYPE,
    );
    await shellA.shutdown();
    expect(shellA.getJobQueueService().getRegisteredTypes()).not.toContain(
      RECURRING_CHECK_JOB_TYPE,
    );

    await writeAndReadShellState(shellB, "shell-b-after-a-shutdown");
    await shellB.shutdown();

    const reopenedShellA = Shell.createFresh(configA, defaultDependencies());
    shells.push(reopenedShellA);
    await reopenedShellA.initialize({ mode: "startup-check" });

    const reopenedRuntimeA = reopenedShellA.getRuntimeState().scoped({
      namespace: "service-ownership.integration",
      schema: z.string(),
    });
    expect(
      await reopenedShellA.getEntityService().getEntity({
        entityType: "note",
        id: recordA.entityId,
      }),
    ).not.toBeNull();
    expect(
      await reopenedShellA
        .getConversationService()
        .getConversation(recordA.conversationId),
    ).not.toBeNull();
    expect(await reopenedRuntimeA.get(recordA.runtimeKey)).toBe(
      "shell-a-first runtime value",
    );
    expect(
      await reopenedShellA.getJobQueueService().getStatus(recordA.jobId),
    ).not.toBeNull();
  });

  it("keeps a running shell usable after another shell fails construction and initialization", async () => {
    const directoryA = await createDirectory();
    await migrateTestDatabases(directoryA.dir);
    const shellA = Shell.createFresh(
      createTestConfig(directoryA.dir),
      defaultDependencies(),
    );
    shells.push(shellA);
    await shellA.initialize();
    await writeAndReadShellState(shellA, "before-failures");

    const constructionDirectory = await createDirectory();
    const constructionConfig = createTestConfig(constructionDirectory.dir);
    constructionConfig.database = { url: "invalid://entity-database" };
    let constructionError: unknown;
    try {
      Shell.createFresh(constructionConfig, defaultDependencies());
    } catch (error) {
      constructionError = error;
    }
    expect(constructionError).toBeDefined();
    await writeAndReadShellState(shellA, "after-construction-failure");

    const initializationFailure = new Error("plugin initialization failed");
    const failingPlugin: Plugin = {
      id: "ownership-initialization-failure",
      packageName: "@test/ownership-initialization-failure",
      version: "1.0.0",
      type: "service",
      description: "Fails shell initialization",
      requiresDaemonStartup: () => true,
      register: async () => {
        throw initializationFailure;
      },
    };
    const initializationDirectory = await createDirectory();
    await migrateTestDatabases(initializationDirectory.dir);
    const initializationConfig = createTestConfig(initializationDirectory.dir);
    initializationConfig.plugins = [failingPlugin];
    const failingShell = Shell.createFresh(
      initializationConfig,
      defaultDependencies(),
    );
    shells.push(failingShell);

    let initializationError: unknown;
    try {
      await failingShell.initialize();
    } catch (error) {
      initializationError = error;
    }

    expect(initializationError).toBe(initializationFailure);
    expect(
      failingShell.getJobQueueService().getRegisteredTypes(),
    ).not.toContain(RECURRING_CHECK_JOB_TYPE);
    await writeAndReadShellState(shellA, "after-initialization-failure");
  });

  it("repeats register-only and startup-check boots without singleton resets", async () => {
    const directory = await createDirectory();
    await migrateTestDatabases(directory.dir);
    const config = createTestConfig(directory.dir);
    const modes = [
      "register-only",
      "startup-check",
      "register-only",
      "startup-check",
    ] as const;

    for (const [index, mode] of modes.entries()) {
      const shell = Shell.createFresh(config, defaultDependencies());
      shells.push(shell);
      await shell.initialize({ mode });

      const runtimeState = shell.getRuntimeState().scoped({
        namespace: "service-ownership.repeated-modes",
        schema: z.string(),
      });
      await runtimeState.set(`boot-${index}`, mode);
      expect(await runtimeState.get(`boot-${index}`)).toBe(mode);
      expect(shell.getJobQueueService().getRegisteredTypes()).toContain(
        RECURRING_CHECK_JOB_TYPE,
      );

      await shell.shutdown();
      expect(shell.getJobQueueService().getRegisteredTypes()).not.toContain(
        RECURRING_CHECK_JOB_TYPE,
      );
    }
  });

  it("owns injected queue and runtime-state services through recurring-check shutdown", async () => {
    const directory = await createDirectory();
    await migrateTestDatabases(directory.dir);
    const jobQueueService = JobQueueService.createFresh(
      { url: `file:${directory.dir}/jobs.db` },
      logger,
    );
    const runtimeStateService = RuntimeStateService.createFresh(
      { url: `file:${directory.dir}/runtime-state.db` },
      logger,
    );
    const runtimeState = runtimeStateService.scoped({
      namespace: "service-ownership.injected",
      schema: z.string(),
    });
    const shell = Shell.createFresh(createTestConfig(directory.dir), {
      ...defaultDependencies(),
      jobQueueService,
      runtimeStateService,
    });
    shells.push(shell);

    await shell.initialize();
    await runtimeState.set("owned", "yes");
    expect(await runtimeState.get("owned")).toBe("yes");
    expect(jobQueueService.getRegisteredTypes()).toContain(
      RECURRING_CHECK_JOB_TYPE,
    );
    expect(jobQueueService.getRegisteredTypes()).toContain("shell:embedding");

    await shell.shutdown();

    expect(jobQueueService.getRegisteredTypes()).not.toContain(
      RECURRING_CHECK_JOB_TYPE,
    );
    expect(jobQueueService.getRegisteredTypes()).not.toContain(
      "shell:embedding",
    );
    await expectClientClosed(jobQueueService.getStats());
    await expectClientClosed(runtimeState.get("owned"));
  });
});
