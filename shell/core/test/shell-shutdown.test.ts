import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import { resetAllSingletons } from "../src/initialization/shellInitializer";
import { createSilentLogger } from "@brains/test-utils";
import { createTestDirectory } from "./helpers/test-db";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";

function createTestConfig(dir: string): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/test-jobs.db` },
    conversationDatabase: { url: `file:${dir}/test-conv.db` },
    embeddingDatabase: { url: `file:${dir}/test-embeddings.db` },
    embedding: {
      cacheDir: `${dir}/embeddings`,
      model: "fast-all-MiniLM-L6-v2",
    },
  };
}

async function runMigrations(dir: string): Promise<void> {
  await migrateEntities({ url: `file:${dir}/test.db` });
  await migrateJobQueue({ url: `file:${dir}/test-jobs.db` });
  await migrateConversations({ url: `file:${dir}/test-conv.db` });
}

const mockEmbeddingService = {
  dimensions: 1536,
  generateEmbedding: async (): Promise<Float32Array> =>
    new Float32Array(1536).fill(0.1),
  generateEmbeddings: async (texts: string[]): Promise<Float32Array[]> =>
    texts.map(() => new Float32Array(1536).fill(0.1)),
};

const deps: ShellDependencies = {
  logger: createSilentLogger(),
  embeddingService: mockEmbeddingService,
};

describe("Shell shutdown", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };

  beforeEach(async () => {
    testDir = await createTestDirectory();
    await resetAllSingletons();
  });

  afterEach(async () => {
    await resetAllSingletons();
    await testDir.cleanup();
  });

  it("should close entity database connection on shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();

    const entityService = shell.getEntityService();

    // Verify DB works before shutdown
    const result = await entityService.listEntities("note");
    expect(result).toEqual([]);

    await shell.shutdown();

    // After shutdown, entity DB client should be closed.
    let threw = false;
    try {
      await entityService.listEntities("note");
    } catch (e: unknown) {
      threw = true;
      const fullError =
        String(e) + (e instanceof Error && e.cause ? String(e.cause) : "");
      expect(fullError).toContain("CLIENT_CLOSED");
    }
    expect(threw).toBe(true);
  });

  it("should close job queue database connection on shutdown", async () => {
    await runMigrations(testDir.dir);
    const config = createTestConfig(testDir.dir);
    const shell = Shell.createFresh(config, deps);
    await shell.initialize();

    const jobQueueService = shell.getJobQueueService();

    // Verify DB works before shutdown
    const stats = await jobQueueService.getStats();
    expect(stats).toBeDefined();

    await shell.shutdown();

    // After shutdown, job queue DB client should be closed.
    let threw = false;
    try {
      await jobQueueService.getStats();
    } catch (e: unknown) {
      threw = true;
      const fullError =
        String(e) + (e instanceof Error && e.cause ? String(e.cause) : "");
      expect(fullError).toContain("CLIENT_CLOSED");
    }
    expect(threw).toBe(true);
  });

  it("should allow a second shell to boot cleanly after first is shut down", async () => {
    await runMigrations(testDir.dir);
    const config1 = createTestConfig(testDir.dir);
    const shell1 = Shell.createFresh(config1, deps);
    await shell1.initialize();

    // Use the first shell's job queue
    const stats1 = await shell1.getJobQueueService().getStats();
    expect(stats1).toBeDefined();

    await shell1.shutdown();

    // Second shell with fresh DB paths — no resetAllSingletons() needed,
    // Shell.createFresh() handles singleton cleanup internally.
    const testDir2 = await createTestDirectory();
    await runMigrations(testDir2.dir);
    const config2 = createTestConfig(testDir2.dir);
    const shell2 = Shell.createFresh(config2, deps);
    await shell2.initialize();

    // Second shell should work without CLIENT_CLOSED errors
    const stats2 = await shell2.getJobQueueService().getStats();
    expect(stats2).toBeDefined();

    const entities = await shell2.getEntityService().listEntities("note");
    expect(entities).toEqual([]);

    await shell2.shutdown();
    await testDir2.cleanup();
  });
});
