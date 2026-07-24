import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import {
  AnchorProfileService,
  BrainCharacterService,
} from "@brains/identity-service";
import type { ShellConfigInput } from "../src/config";
import { ShellInitializer } from "../src/initialization/shellInitializer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";
import { PluginManager } from "@brains/plugins";
import { EntityRegistry } from "@brains/entity-service";
import {
  JobQueueWorker,
  JobQueueService,
  BatchJobManager,
  JobProgressMonitor,
} from "@brains/job-queue";
import { DataSourceRegistry } from "@brains/entity-service";
import { MessageBus } from "@brains/messaging-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { AtprotoPlugin } from "@brains/atproto";
import {
  AtprotoProjectionRegistry,
  type AtprotoPdsClientLike,
} from "@brains/atproto-contracts";

async function resetAllSingletons(): Promise<void> {
  await Shell.resetInstance();
  ShellInitializer.resetInstance();
  PluginManager.resetInstance();
  MessageBus.resetInstance();
  EntityRegistry.resetInstance();
  JobQueueWorker.resetInstance();
  JobQueueService.resetInstance();
  BatchJobManager.resetInstance();
  JobProgressMonitor.resetInstance();
  DataSourceRegistry.resetInstance();
  BrainCharacterService.resetInstance();
  AnchorProfileService.resetInstance();
  AtprotoProjectionRegistry.resetInstance();
}

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    siteBaseUrl: "brain.example.com",
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/test-jobs.db` },
    conversationDatabase: { url: `file:${dir}/test-conv.db` },
    runtimeStateDatabase: { url: `file:${dir}/test-runtime-state.db` },
    embeddingDatabase: { url: `file:${dir}/test-embeddings.db` },
    ai: {
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    },
    embedding: {
      cacheDir: `${dir}/embeddings`,
      model: "fast-all-MiniLM-L6-v2",
    },
  };
}

const mockEmbeddingService = {
  dimensions: 1536,
  generateEmbedding: async (): Promise<{
    embedding: Float32Array;
    usage: { tokens: number };
  }> => ({
    embedding: new Float32Array(1536).fill(0.1),
    usage: { tokens: 10 },
  }),
  generateEmbeddings: async (
    texts: string[],
  ): Promise<{
    embeddings: Float32Array[];
    usage: { tokens: number };
  }> => ({
    embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
    usage: { tokens: texts.length * 10 },
  }),
};

const deps: ShellDependencies = {
  logger: createSilentLogger(),
  embeddingService: mockEmbeddingService,
};

function createPdsClientMocks(): {
  client: () => AtprotoPdsClientLike;
  putRecord: ReturnType<typeof mock>;
} {
  const putRecord = mock(async () => ({
    uri: "at://did:plc:repo/ai.rizom.brain.card/self",
    cid: "cid",
  }));
  const client: AtprotoPdsClientLike = {
    createSession: mock(async () => ({
      did: "did:plc:repo",
      handle: "brain.example.com",
      accessJwt: "jwt",
      refreshJwt: "refresh",
    })),
    createRecord: mock(async () => ({
      uri: "at://did:plc:repo/record",
      cid: "cid",
    })),
    putRecord,
    deleteRecord: mock(async () => {}),
  };
  return { client: () => client, putRecord };
}

function createConfiguredAtprotoPlugin(
  createPdsClient: () => AtprotoPdsClientLike,
): AtprotoPlugin {
  return new AtprotoPlugin(
    {
      identifier: "brain.example.com",
      appPassword: "secret",
      repoDid: "did:plc:repo",
    },
    { createPdsClient },
  );
}

// The unit tests in plugins/atproto arm the full-boot gate by broadcasting
// pluginsRegistered manually. This suite proves the REAL bootloader arms it:
// a full Shell.initialize() must publish the brain card, and a startup-check
// boot must not.
describe("AT Protocol boot publishing through the real bootloader", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };
  let shell: Shell;

  beforeEach(async (): Promise<void> => {
    testDir = await createTestDirectory();
    await resetAllSingletons();
    // The card publisher queries entity stats; the schema must exist before
    // boot schedules the publish task.
    await migrateEntities({ url: `file:${testDir.dir}/test.db` });
    await migrateJobQueue({ url: `file:${testDir.dir}/test-jobs.db` });
    await migrateConversations({ url: `file:${testDir.dir}/test-conv.db` });
    await migrateRuntimeState({
      url: `file:${testDir.dir}/test-runtime-state.db`,
    });
  });

  afterEach(async (): Promise<void> => {
    await shell.shutdown();
    await resetAllSingletons();
    await testDir.cleanup();
  });

  it("publishes the brain card during a full boot", async () => {
    const { client, putRecord } = createPdsClientMocks();
    const plugin = createConfiguredAtprotoPlugin(client);

    const config = createTestConfig(testDir.dir);
    config.plugins = [plugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize();
    // Boot publishing is scheduled, not awaited; shutdown drains the tasks.
    await plugin.shutdown?.();

    const cardCalls = putRecord.mock.calls.filter(
      (call) =>
        (call[0] as { collection?: string }).collection ===
        "ai.rizom.brain.card",
    );
    expect(cardCalls).toHaveLength(1);
  });

  it("does not publish during a startup-check boot", async () => {
    const { client, putRecord } = createPdsClientMocks();
    const plugin = createConfiguredAtprotoPlugin(client);

    const config = createTestConfig(testDir.dir);
    config.plugins = [plugin];
    shell = Shell.createFresh(config, deps);
    await shell.initialize({ mode: "startup-check" });
    await plugin.shutdown?.();

    expect(putRecord).not.toHaveBeenCalled();
  });
});
