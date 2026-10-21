import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { createTestEntity } from "../src/test/index";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

/** The query's own embedding in these tests; a stored copy matches it exactly. */
const queryVector = new Float32Array(MOCK_DIMENSIONS).fill(0.1);
/** Close to the query, but further than an exact copy. */
const nearVector = new Float32Array(MOCK_DIMENSIONS).map((_, index) =>
  index % 20 === 0 ? -0.1 : 0.1,
);

describe("search over rows of a type this brain does not load", () => {
  let ctx: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await ctx?.cleanup();
    ctx = undefined;
  });

  for (const embeddingsEnabled of [false, true]) {
    test(`leaves them out before the limit applies (${embeddingsEnabled ? "semantic" : "lexical"})`, async () => {
      ctx = await setupEntityService(
        [
          {
            name: "test",
            schema: minimalTestSchema,
            adapter: minimalTestAdapter,
          },
        ],
        { embeddingsEnabled },
      );
      const entity = createTestEntity("test", { content: "Quokka notes" });
      await ctx.entityService.createEntity({ entity });

      // A row left by a plugin this brain no longer loads, ranked first.
      const leftover = "Quokka quokka quokka quokka";
      const db = new Database(fileURLToPath(ctx.dbConfig.url));
      db.query(
        "INSERT INTO entities (id, entityType, content, contentHash, metadata, created, updated, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "leftover",
        "swot",
        leftover,
        "leftover-hash",
        "{}",
        0,
        0,
        "public",
      );
      db.query(
        "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (?, ?, ?)",
      ).run("leftover", "swot", leftover);
      db.close();
      if (embeddingsEnabled) {
        await ctx.entityService.storeEmbedding({
          entityId: "leftover",
          entityType: "swot",
          embedding: queryVector,
          contentHash: "leftover-hash",
        });
        await ctx.entityService.storeEmbedding({
          entityId: entity.id,
          entityType: "test",
          embedding: nearVector,
          contentHash: entity.contentHash,
        });
      }

      const results = await ctx.entityService.search({
        query: "Quokka",
        options: { limit: 1 },
      });

      expect(results.map((result) => result.entity.id)).toEqual([entity.id]);
    });
  }

  test("finds nothing for a requested type the brain does not load", async () => {
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
      ],
      { embeddingsEnabled: false },
    );
    await ctx.entityService.createEntity({
      entity: createTestEntity("test", { content: "Quokka notes" }),
    });

    expect(
      await ctx.entityService.search({
        query: "Quokka",
        options: { types: ["swot"] },
      }),
    ).toEqual([]);
  });
});
