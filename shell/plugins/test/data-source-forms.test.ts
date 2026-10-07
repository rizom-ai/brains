import { describe, expect, it } from "bun:test";
import { baseEntitySchema, defineDataSource } from "../src";

/**
 * One helper, two ways to answer.
 *
 * A data source either fetches — it reaches somewhere the brain does not
 * store and returns what it found — or it reads one of the brain's own entity
 * types, in which case the runtime does the paging, the sorting and the
 * neighbour lookups. Those are different jobs, but they were two helper names
 * for one concept, and an author had to know which name to reach for before
 * knowing that.
 *
 * A declaration that is both, or neither, matches neither form, so the two
 * stay exclusive without anyone checking at runtime. The check that remains
 * is for a caller reaching this from JavaScript, where there are no types.
 */
describe("declaring a data source", () => {
  it("takes a source that fetches what the brain does not store", async () => {
    const source = defineDataSource({
      id: "weather",
      name: "Weather",
      description: "Today's forecast, from somewhere else.",
      fetch: async () => ({ temperature: 12 }),
    });

    expect(source.kind).toBe("rizom-data-source");
    expect(source.id).toBe("weather");
    expect(source.description).toContain("somewhere else");
  });

  it("takes a source that reads one of the brain's own types", () => {
    const source = defineDataSource({
      id: "bookmarks",
      name: "Bookmarks",
      description: "Everything saved, newest first.",
      entityType: "bookmark",
      entitySchema: baseEntitySchema,
      defaultSort: [{ field: "created", direction: "desc" }],
      transform: (entity) => ({ id: entity.id }),
      list: (items) => ({ items }),
    });

    expect(source.kind).toBe("rizom-entity-data-source");
    expect(source.config.entityType).toBe("bookmark");
    expect(source.config.defaultSort).toEqual([
      { field: "created", direction: "desc" },
    ]);
  });
});
