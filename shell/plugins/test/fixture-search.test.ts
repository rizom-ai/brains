import { describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import { baseEntitySchema, type IEntityService } from "@brains/entity-service";
import { createMockShell } from "../src/test/mock-shell";
import { z } from "@brains/utils/zod";

function fixture(): IEntityService {
  const shell = createMockShell();
  shell.addEntities([
    createTestEntity("record", {
      id: "alpha",
      content: "needle body",
      metadata: { title: "First", n: "1" },
      visibility: "public",
      created: "2026-01-01T00:00:00Z",
    }),
    createTestEntity("record", {
      id: "beta",
      content: "other body",
      metadata: { title: "NEEDLE title", n: "2" },
      visibility: "shared",
      created: "2026-01-02T00:00:00Z",
    }),
    createTestEntity("record", {
      id: "needle-hidden",
      content: "other body",
      metadata: { title: "Hidden", n: "3" },
      visibility: "restricted",
      created: "2026-01-03T00:00:00Z",
    }),
    createTestEntity("other", {
      id: "other",
      content: "needle body",
      metadata: {},
      visibility: "public",
    }),
    createTestEntity("record", {
      id: "failed",
      content: "needle body",
      metadata: { status: "failed" },
      visibility: "public",
    }),
    createTestEntity("record", {
      id: "generating",
      content: "needle body",
      metadata: { status: "generating" },
      visibility: "public",
    }),
  ]);
  return shell.getEntityService();
}

describe("deterministic fixture search", () => {
  it("matches id/title/body case-insensitively, fails closed, and intersects type filters", async () => {
    const service = fixture();
    expect(
      (await service.search({ query: " NeEdLe " })).map(
        ({ entity }) => entity.id,
      ),
    ).toEqual(["other", "alpha"]);
    expect(
      (
        await service.search({
          query: "needle",
          options: { types: ["record"], visibilityScope: "shared" },
        })
      ).map(({ entity }) => entity.id),
    ).toEqual(["alpha", "beta"]);
    expect(
      (
        await service.search({
          query: "needle",
          options: { excludeTypes: ["other"], visibilityScope: "restricted" },
        })
      ).map(({ entity }) => entity.id),
    ).toEqual(["alpha", "beta", "needle-hidden"]);
    expect(
      await service.search({
        query: "needle",
        options: { types: ["record"], excludeTypes: ["record"] },
      }),
    ).toEqual([]);
    expect(
      (
        await service.search({
          query: "needle title",
          options: { types: ["record"], visibilityScope: "restricted" },
        })
      ).map(({ entity }) => entity.id),
    ).toEqual(["beta"]);
    expect(await service.search({ query: "unmatched" })).toEqual([]);
    expect(await service.search({ query: "  " })).toEqual([]);
  });

  it("uses explicit weights and stable sorting before paging, and supports generation-state opt-in", async () => {
    const service = fixture();
    const request = {
      query: "needle",
      options: {
        visibilityScope: "restricted" as const,
        weight: { record: 2 },
        limit: 1,
        offset: 1,
        minScore: 1.5,
      },
    };
    expect(await service.search(request)).toMatchObject([
      { entity: { id: "beta" }, score: 2, excerpt: "other body" },
    ]);
    expect(
      (
        await service.search({
          query: "needle",
          options: {
            visibilityScope: "restricted",
            types: ["record"],
            sortBy: "created",
            sortDirection: "desc",
            limit: 2,
          },
        })
      ).map(({ entity }) => entity.id),
    ).toEqual(["needle-hidden", "beta"]);
    expect(
      (
        await service.search({
          query: "needle",
          options: { types: ["record"], includeUngenerated: true },
        })
      ).map(({ entity }) => entity.id),
    ).toEqual(["alpha", "failed", "generating"]);
    expect(
      await service.search({ query: "needle", options: { offset: 100 } }),
    ).toEqual([]);
    expect(await service.search(request)).toEqual(
      await service.search(request),
    );
  });

  it("parses schema-bearing results once and observes cancellation", async () => {
    const service = fixture();
    let parses = 0;
    const schema = baseEntitySchema.extend({
      metadata: z.object({
        n: z.string().transform((value) => {
          parses++;
          return Number(value);
        }),
      }),
    });
    const results = await service.search(
      { query: "needle", options: { types: ["record"] } },
      schema,
    );
    expect(results.map(({ entity }) => entity.metadata.n)).toEqual([1]);
    expect(parses).toBe(1);
    const invalid = await service.search({ query: "needle" }, schema).then(
      () => null,
      (error: unknown) => error,
    );
    expect(invalid).toBeInstanceOf(z.ZodError);
    const controller = new AbortController();
    const reason = new Error("Search cancelled");
    controller.abort(reason);
    const cancelled = await service
      .search({ query: "needle", options: { signal: controller.signal } })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(cancelled).toBe(reason);
  });
});
