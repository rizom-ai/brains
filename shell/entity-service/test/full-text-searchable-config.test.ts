import { describe, test, expect, afterEach } from "bun:test";
import { createTestEntity } from "@brains/test-utils";
import type { EntityTypeConfig } from "../src";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";

/**
 * `fullTextSearchable: false` keeps a type's content out of keyword search.
 * There is no separate full-text index on this engine — the portable scan
 * reads entity content directly — so the exclusion is enforced as a search
 * predicate rather than by skipping index rows.
 */
describe("EntityTypeConfig fullTextSearchable", () => {
  let ctx: EntityServiceTestContext | undefined;

  afterEach(async () => {
    await ctx?.cleanup();
    ctx = undefined;
  });

  async function setup(config?: EntityTypeConfig): Promise<void> {
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
          ...(config && { config }),
        },
      ],
      { embeddingsEnabled: false },
    );
  }

  test("keyword search matches entity types by default", async () => {
    await setup();
    if (!ctx) throw new Error("Test service not initialized");
    const entity = createTestEntity("test", {
      id: "searchable",
      content: "ordinary searchable xylophone text",
    });
    await ctx.entityService.createEntity({ entity });

    const results = await ctx.entityService.search({ query: "xylophone" });

    expect(results.map((result) => result.entity.id)).toContain(entity.id);
  });

  test("keyword search skips types excluded from full-text search", async () => {
    await setup({ embeddable: false, fullTextSearchable: false });
    if (!ctx) throw new Error("Test service not initialized");
    const entity = createTestEntity("test", {
      id: "not-searchable",
      content: "binary payload stand-in xylophone",
    });
    await ctx.entityService.createEntity({ entity });

    const results = await ctx.entityService.search({ query: "xylophone" });

    expect(results).toEqual([]);
  });
});
