import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { IEmbeddingService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import {
  createSilentLogger,
  createTestDirectory,
  waitUntil,
} from "@brains/test-utils";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

/** An embedding model whose provider can go down and come back. */
function embeddingModel(
  model: string,
  dimensions: number,
): IEmbeddingService & { embedded: string[]; failures: number; down: boolean } {
  const embedded: string[] = [];
  const service = {
    identity: { model, dimensions, promptRevision: 0 },
    embedded,
    failures: 0,
    down: false,
    embedQuery: async (
      text: string,
    ): Promise<{ embedding: Float32Array; usage: { tokens: number } }> => {
      if (service.down) {
        service.failures += 1;
        throw new Error(`${model} is unreachable`);
      }
      service.embedded.push(text);
      return {
        embedding: new Float32Array(dimensions).fill(0.1),
        usage: { tokens: 1 },
      };
    },
    embedDocuments: async (
      documents: { content: string }[],
    ): Promise<{ embeddings: Float32Array[]; usage: { tokens: number } }> => {
      const results = await Promise.all(
        documents.map((document) => service.embedQuery(document.content)),
      );
      return {
        embeddings: results.map((result) => result.embedding),
        usage: { tokens: documents.length },
      };
    },
  };
  return service;
}

const notes = ["first note on institutions", "second note on networks"];

describe("switching the embedding model", () => {
  let testDir: { dir: string; cleanup: () => Promise<void> };
  let shell: Shell | undefined;

  beforeEach(async () => {
    testDir = await createTestDirectory();
    await migrateEntities({ url: `file:${testDir.dir}/test.db` });
    await migrateJobQueue({ url: `file:${testDir.dir}/test-jobs.db` });
    await migrateRuntimeState({
      url: `file:${testDir.dir}/test-runtime-state.db`,
    });
  });

  afterEach(async () => {
    await shell?.shutdown();
    shell = undefined;
    await testDir.cleanup();
  });

  async function boot(embeddingService: IEmbeddingService): Promise<Shell> {
    shell = Shell.createFresh(createTestShellConfig(testDir.dir), {
      logger: createSilentLogger("embedding-model-switch"),
      embeddingService,
    });
    await shell.initialize();
    return shell;
  }

  /**
   * A brain whose index the original model built; how many entities it
   * embedded, the notes and the brain's own defaults.
   */
  async function indexWithOriginalModel(): Promise<number> {
    const original = await boot(embeddingModel("test:original", 4));
    await Promise.all(
      notes.map((content, index) =>
        original.getEntityService().createEntity({
          entity: {
            id: `note-${index}`,
            entityType: "note",
            content,
            metadata: {},
          },
        }),
      ),
    );
    await original.getEntityService().awaitIndexReady({ timeoutMs: 5_000 });
    const indexed = await original.getEntityService().countEmbeddings();
    expect(indexed).toBeGreaterThanOrEqual(notes.length);
    await original.shutdown();
    shell = undefined;
    return indexed;
  }

  it("rebuilds the index with the new model before chat opens", async () => {
    const indexed = await indexWithOriginalModel();
    const next = embeddingModel("test:next", 8);

    const restarted = await boot(next);
    await waitUntil(
      () => restarted.getEntityService().isIndexReady(),
      "the rebuilt index to be ready",
      { timeoutMs: 5_000 },
    );

    expect(await restarted.getEntityService().countEmbeddings()).toBe(indexed);
    expect(next.embedded).toHaveLength(indexed);
    expect(
      notes.every((content) =>
        next.embedded.some((text) => text.includes(content)),
      ),
    ).toBe(true);
    const status = await restarted
      .getEntityService()
      .awaitIndexReady({ timeoutMs: 1_000 });
    expect(status).toMatchObject({ ready: true, degraded: false });
  });

  it("holds chat while the new model's provider is down and opens once it returns", async () => {
    const indexed = await indexWithOriginalModel();
    const next = embeddingModel("test:next", 8);
    next.down = true;

    const restarted = await boot(next);
    await waitUntil(
      () => next.failures >= indexed,
      "every re-embedding to fail",
      { timeoutMs: 5_000 },
    );
    expect(restarted.getEntityService().isIndexReady()).toBe(false);
    expect(await restarted.getEntityService().countEmbeddings()).toBe(0);

    next.down = false;
    await waitUntil(
      () => restarted.getEntityService().isIndexReady(),
      "the retried embeddings to open chat",
      { timeoutMs: 10_000 },
    );
    expect(await restarted.getEntityService().countEmbeddings()).toBe(indexed);
    const status = await restarted
      .getEntityService()
      .awaitIndexReady({ timeoutMs: 1_000 });
    expect(status).toMatchObject({ ready: true, degraded: false });
  }, 20_000);

  it("opens degraded after an outage outlasts the retries, and retries on the next start", async () => {
    const indexed = await indexWithOriginalModel();
    const next = embeddingModel("test:next", 8);
    next.down = true;

    const outage = await boot(next);
    await waitUntil(
      () => outage.getEntityService().isIndexReady(),
      "chat to open once the retries are spent",
      { timeoutMs: 20_000, intervalMs: 100 },
    );
    expect(
      await outage.getEntityService().awaitIndexReady({ timeoutMs: 1_000 }),
    ).toMatchObject({ ready: true, degraded: true, failedEmbeddings: indexed });
    await outage.shutdown();
    shell = undefined;

    next.down = false;
    const restarted = await boot(next);
    await waitUntil(
      async () =>
        (await restarted.getEntityService().countEmbeddings()) === indexed,
      "the restart to re-embed what failed",
      { timeoutMs: 10_000 },
    );
    expect(
      await restarted.getEntityService().awaitIndexReady({ timeoutMs: 5_000 }),
    ).toMatchObject({ ready: true, degraded: false });
  }, 45_000);
});
