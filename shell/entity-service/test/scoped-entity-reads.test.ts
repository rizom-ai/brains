import { describe, expect, it, spyOn } from "bun:test";
import { scopeEntityReads } from "../src/scoped-entity-reads";
import { createMockEntityService } from "../src/test/mock-entity-service";

// One read view for people who may see only part of a brain: a site build, a
// visitor's insight. Every read it offers applies the scope it was made with,
// and a caller cannot widen it.
describe("scopeEntityReads", () => {
  it("preserves narrower visibility on every scoped read", async () => {
    const base = createMockEntityService({ entityTypes: ["post"] });
    const view = scopeEntityReads(base, {
      publishedOnly: true,
      visibilityScope: "restricted",
    });
    await view.getEntity({
      entityType: "post",
      id: "a",
      visibilityScope: "public",
    });
    expect(base.getEntity).toHaveBeenCalledWith({
      entityType: "post",
      id: "a",
      visibilityScope: "public",
      publishedOnly: true,
    });
    await view.search({
      query: "memory",
      options: { visibilityScope: "public" },
    });
    expect(base.search).toHaveBeenCalledWith({
      query: "memory",
      options: { visibilityScope: "public", publishedOnly: true },
    });
    const request = {
      entityType: "post",
      options: {
        filter: { visibilityScope: "public" as const },
        publishedOnly: true,
      },
    };
    await view.listEntities(request);
    expect(base.listEntities).toHaveBeenCalledWith(request);
    await view.countEntities(request);
    expect(base.countEntities).toHaveBeenLastCalledWith(request);
    await view.getEntityCounts("public");
    expect(base.countEntities).toHaveBeenLastCalledWith(request);
  });

  it("returns the service itself when there is nothing to scope", () => {
    const base = createMockEntityService();
    expect(scopeEntityReads(base, {})).toBe(base);
  });

  it("counts only published work per type when publishedOnly is set", async () => {
    const base = createMockEntityService();
    spyOn(base, "getEntityTypes").mockReturnValue(["post", "note", "link"]);
    const count = spyOn(base, "countEntities").mockImplementation(
      async ({ entityType }) =>
        ({ post: 2, note: 0, link: 1 })[entityType] ?? 0,
    );
    const counts = await scopeEntityReads(base, {
      publishedOnly: true,
      visibilityScope: "public",
    }).getEntityCounts("restricted");

    expect(counts).toEqual([
      { entityType: "post", count: 2 },
      { entityType: "link", count: 1 },
    ]);
    for (const [request] of count.mock.calls) {
      expect(request.options).toMatchObject({
        publishedOnly: true,
        filter: { visibilityScope: "public" },
      });
    }
  });

  it("counts by the configured scope when only visibility is scoped", async () => {
    const base = createMockEntityService();
    const counts = spyOn(base, "getEntityCounts").mockResolvedValue([]);
    await scopeEntityReads(base, { visibilityScope: "public" }).getEntityCounts(
      "restricted",
    );
    expect(counts).toHaveBeenCalledWith("public");
  });

  it("applies publishedOnly and the scope to search, get and listings", async () => {
    const base = createMockEntityService();
    const search = spyOn(base, "search").mockResolvedValue([]);
    const get = spyOn(base, "getEntity").mockResolvedValue(null);
    const list = spyOn(base, "listEntities").mockResolvedValue([]);
    const scoped = scopeEntityReads(base, {
      publishedOnly: true,
      visibilityScope: "public",
    });

    await scoped.search({
      query: "memory",
      options: { visibilityScope: "restricted" },
    });
    await scoped.getEntity({ entityType: "post", id: "a" });
    await scoped.listEntities({ entityType: "post" });

    expect(search).toHaveBeenCalledWith({
      query: "memory",
      options: { visibilityScope: "public", publishedOnly: true },
    });
    expect(get).toHaveBeenCalledWith({
      entityType: "post",
      id: "a",
      visibilityScope: "public",
      publishedOnly: true,
    });
    expect(list.mock.calls[0]?.[0].options).toMatchObject({
      publishedOnly: true,
      filter: { visibilityScope: "public" },
    });
  });
});
