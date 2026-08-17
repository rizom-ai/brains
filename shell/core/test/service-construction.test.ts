import { describe, expect, it, spyOn } from "bun:test";
import type {
  IRuntimeStateStore,
  RuntimeStateRecordValue,
} from "@brains/runtime-state";
import { InboxRegistry, PluginManager } from "@brains/plugins";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import {
  createMockJobQueueService,
  createMockShell,
  createSilentLogger,
} from "@brains/test-utils";
import { createTestDirectory } from "@brains/test-utils";

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/jobs.db` },
    conversationDatabase: { url: `file:${dir}/conv.db` },
    runtimeStateDatabase: { url: `file:${dir}/runtime-state.db` },
    embeddingDatabase: { url: `file:${dir}/embeddings.db` },
    ai: {
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    },
  };
}

describe("Shell service construction", () => {
  it("closes acquired services when later construction fails", async () => {
    const testDir = await createTestDirectory();
    const constructionError = new Error("shell wiring failed");
    let runtimeStateCloseCalls = 0;
    let jobQueueCloseCalls = 0;
    const inboxRegistry = new InboxRegistry();

    const jobQueueService = createMockJobQueueService();
    spyOn(jobQueueService, "close").mockImplementation(() => {
      jobQueueCloseCalls++;
    });

    const pluginManager = PluginManager.createFresh(
      createSilentLogger("test"),
      createMockShell().getDaemonRegistry(),
    );
    spyOn(pluginManager, "setShell").mockImplementation((): never => {
      throw constructionError;
    });

    const dependencies: ShellDependencies = {
      logger: createSilentLogger("test"),
      embeddingService: {
        dimensions: 1536,
        generateEmbedding: async () => ({
          embedding: new Float32Array(1536).fill(0.1),
          usage: { tokens: 1 },
        }),
        generateEmbeddings: async (texts: string[]) => ({
          embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
          usage: { tokens: texts.length },
        }),
      },
      runtimeStateService: {
        initialize: async (): Promise<void> => {},
        scoped: <T>(): IRuntimeStateStore<T> => ({
          get: async (): Promise<T | null> => null,
          has: async (): Promise<boolean> => false,
          set: async (): Promise<void> => {},
          setIfNotExists: async (): Promise<boolean> => true,
          delete: async (): Promise<boolean> => false,
          list: async (): Promise<RuntimeStateRecordValue<T>[]> => [],
          clear: async (): Promise<number> => 0,
        }),
        close: (): void => {
          runtimeStateCloseCalls++;
        },
      },
      recurringCheckService: {
        start: async (): Promise<void> => {},
        stop: async (): Promise<void> => {},
        abandon: (): void => {},
        namespace: () => ({ register: () => () => {} }),
        unregisterPlugin: async (): Promise<void> => {},
        listOpenAlerts: async () => [],
        resolveOpenAlert: async (): Promise<void> => {},
      },
      inboxRegistry,
      // The shared factory rather than a four-method stand-in: IJobQueueService
      // has two dozen members, and the cast this replaces meant the fake could
      // drift from any of them.
      jobQueueService,
      // A real PluginManager with setShell made to throw: it is a class, so no
      // literal could ever satisfy it, and the failure this test needs is one
      // method's behaviour rather than a different object.
      pluginManager,
    };

    try {
      let receivedError: unknown;
      try {
        Shell.createFresh(createTestConfig(testDir.dir), dependencies);
      } catch (error) {
        receivedError = error;
      }

      expect(receivedError).toBe(constructionError);
      expect(runtimeStateCloseCalls).toBe(1);
      expect(jobQueueCloseCalls).toBe(1);
      inboxRegistry.finalize();
      expect(inboxRegistry.listSources()).toEqual([]);
    } finally {
      await testDir.cleanup();
    }
  });
});
