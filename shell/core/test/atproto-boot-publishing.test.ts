import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestShellConfig } from "./helpers/test-config";
import { Shell, type ShellDependencies } from "../src/shell";
import { ProfileKindRegistry } from "@brains/identity-service";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "@brains/test-utils";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { AtprotoPlugin } from "@brains/atproto";
import { z } from "@brains/utils/zod";
import {
  AtprotoProjectionRegistry,
  type AtprotoPdsClientLike,
} from "@brains/atproto-contracts";

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

function createTestProfileKindRegistry(): ProfileKindRegistry {
  const registry = new ProfileKindRegistry("professional");
  registry.register("test", {
    kind: "professional",
    category: "person",
    fields: z.object({}),
    labels: { singular: "Professional", plural: "Professionals" },
  });
  return registry;
}

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
    AtprotoProjectionRegistry.resetInstance();
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
    AtprotoProjectionRegistry.resetInstance();
    await testDir.cleanup();
  });

  it("publishes the brain card during a full boot", async () => {
    const { client, putRecord } = createPdsClientMocks();
    const plugin = createConfiguredAtprotoPlugin(client);

    const config = createTestShellConfig(testDir.dir, {
      profileKind: "professional",
      siteBaseUrl: "brain.example.com",
    });
    config.plugins = [plugin];
    shell = Shell.createFresh(config, {
      ...deps,
      profileKindRegistry: createTestProfileKindRegistry(),
    });
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

    const config = createTestShellConfig(testDir.dir, {
      profileKind: "professional",
      siteBaseUrl: "brain.example.com",
    });
    config.plugins = [plugin];
    shell = Shell.createFresh(config, {
      ...deps,
      profileKindRegistry: createTestProfileKindRegistry(),
    });
    await shell.initialize({ mode: "startup-check" });
    await plugin.shutdown?.();

    expect(putRecord).not.toHaveBeenCalled();
  });
});
