import { afterEach, describe, expect, it } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import { resetServiceSingletons } from "../src/initialization/shellInitializer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";

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
  afterEach(async () => {
    await Shell.resetInstance();
    await resetServiceSingletons();
  });

  it("closes acquired services when later construction fails", async () => {
    const testDir = await createTestDirectory();
    const constructionError = new Error("shell wiring failed");
    let runtimeStateCloseCalls = 0;
    let jobQueueCloseCalls = 0;

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
        close: (): void => {
          runtimeStateCloseCalls++;
        },
      } as NonNullable<ShellDependencies["runtimeStateService"]>,
      recurringCheckService: {
        start: async (): Promise<void> => {},
        stop: async (): Promise<void> => {},
        namespace: () => ({ register: () => () => {} }),
        unregisterPlugin: (): void => {},
      } as unknown as NonNullable<ShellDependencies["recurringCheckService"]>,
      jobQueueService: {
        close: (): void => {
          jobQueueCloseCalls++;
        },
        registerHandler: (): void => {},
        getActiveJobs: async () => [],
        getStatus: async () => null,
      } as unknown as NonNullable<ShellDependencies["jobQueueService"]>,
      pluginManager: {
        setShell: (): never => {
          throw constructionError;
        },
      } as unknown as NonNullable<ShellDependencies["pluginManager"]>,
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
    } finally {
      await testDir.cleanup();
    }
  });
});
