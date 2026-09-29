import { expect, spyOn, test } from "bun:test";
import { MAX_SEARCH_QUERY_CHARS } from "@brains/entity-service";
import { GenerationLimitError } from "../src/generation-limits";
import {
  createMockEntityService,
  createTestEntity,
} from "@brains/entity-service/test";
import { createGenerationReadContext } from "../src/generation-read-context";

test("read scope cannot be widened by datasource search options", async () => {
  const note = createTestEntity("note", { visibility: "public" });
  const entities = createMockEntityService({
    returns: {
      getEntity: note,
      search: [{ entity: note, excerpt: "PUBLIC", score: 1 }],
    },
  });
  const reads = createGenerationReadContext(entities, {
    visibilityScope: "public",
  });
  expect(await reads.getEntity("note", note.id)).toBe(note);
  // A structurally compatible object with extra runtime fields cannot inject
  // scope: the entity service owns the visibility predicate and receives ours.
  const options = { limit: 5, visibilityScope: "restricted" };
  expect(await reads.search("query", options)).toHaveLength(1);
  expect(entities.search).toHaveBeenCalledWith({
    query: "query",
    options: { limit: 5, visibilityScope: "public" },
  });
  expect(entities.getEntity).toHaveBeenCalledWith({
    entityType: "note",
    id: note.id,
    visibilityScope: "public",
  });
});

test("search accepts its exact existing limit and rejects overflow before querying", async () => {
  const entities = createMockEntityService();
  const reads = createGenerationReadContext(entities, {
    visibilityScope: "public",
  });
  const query = "x".repeat(MAX_SEARCH_QUERY_CHARS);
  await reads.search(query);
  expect(entities.search).toHaveBeenCalledWith({
    query,
    options: { visibilityScope: "public" },
  });
  const outcome = await reads
    .search(query + "x")
    .catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(GenerationLimitError);
  expect(entities.search).toHaveBeenCalledTimes(1);
});

test("scoped reads stop before touching storage on cancellation", async () => {
  const entities = createMockEntityService();
  const reason = new Error("cancelled");
  const reads = createGenerationReadContext(
    entities,
    { visibilityScope: "public" },
    AbortSignal.abort(reason),
  );
  expect(
    await reads.getEntity("note", "id").catch((error: unknown) => error),
  ).toBe(reason);
  expect(await reads.search("query").catch((error: unknown) => error)).toBe(
    reason,
  );
  expect(entities.getEntity).not.toHaveBeenCalled();
  expect(entities.search).not.toHaveBeenCalled();
});

test("scoped search forwards cancellation and rejects late results", async () => {
  const entities = createMockEntityService();
  const controller = new AbortController();
  const reason = new Error("cancelled during read");
  spyOn(entities, "search").mockImplementation(async () => {
    controller.abort(reason);
    return [];
  });
  const reads = createGenerationReadContext(
    entities,
    { visibilityScope: "shared" },
    controller.signal,
  );
  expect(await reads.search("query").catch((error: unknown) => error)).toBe(
    reason,
  );
  expect(entities.search).toHaveBeenCalledWith({
    query: "query",
    options: { visibilityScope: "shared", signal: controller.signal },
  });
});
