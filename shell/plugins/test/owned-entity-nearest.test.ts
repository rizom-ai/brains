import { describe, expect, test, spyOn } from "bun:test";
import { SdkError } from "@brains/contracts";
import { scopeEntityReads } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src";
import { createJobEntityAccess } from "../src/job/job-entity-access";
import { createOwnedEntityNearest } from "../src/internal/owned-entity-nearest";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";

const note = defineEntity({
  type: "note",
  purpose: "Nearest fixture",
  metadata: z.object({ title: z.string() }),
});
const other = defineEntity({
  type: "other",
  purpose: "Foreign fixture",
  metadata: z.object({ title: z.string() }),
});
const options = { visibility: "public" as const, maxDistance: 0.3, limit: 2 };
async function fixture(): Promise<{
  service: ReturnType<typeof createMockEntityService>;
  store: ReturnType<typeof createMockEntityStore>;
}> {
  const store = createMockEntityStore();
  const service = createMockEntityService(store, () => [
    { entityType: "note", entityId: "private", distance: 0.01 },
    { entityType: "other", entityId: "foreign", distance: 0.02 },
    { entityType: "note", entityId: "draft", distance: 0.03 },
    { entityType: "note", entityId: "near", distance: 0.1 },
    { entityType: "note", entityId: "second", distance: 0.2 },
    { entityType: "note", entityId: "far", distance: 0.5 },
  ]);
  for (const id of ["private", "foreign", "draft", "near", "second", "far"])
    await service.createEntity({
      entity: {
        entityType: id === "foreign" ? "other" : "note",
        id,
        content: id,
        visibility: id === "private" ? "restricted" : "public",
        metadata: { title: id, status: id === "draft" ? "draft" : "published" },
      },
    });
  return { service, store };
}
async function code(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(SdkError);
    return error instanceof SdkError ? error.code : undefined;
  }
}

describe("owned nearest candidates", () => {
  test("owned definition, exact visibility and publication with backend limits and detached typed results", async () => {
    const { service, store } = await fixture();
    const query = spyOn(service, "searchWithDistances");
    const nearest = createJobEntityAccess(
      service,
      new Set(["note"]),
      "owner",
    ).nearest;
    const result = await nearest(note, "question", {
      ...options,
      publishedOnly: true,
    });
    expect(result.map((row) => [row.entity.id, row.distance])).toEqual([
      ["near", 0.1],
      ["second", 0.2],
    ]);
    expect(query).toHaveBeenCalledWith({
      query: "question",
      types: ["note"],
      visibility: "public",
      visibilityScope: "public",
      publishedOnly: true,
      maxDistance: 0.3,
      limit: 2,
      excludeIds: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
    const first = result[0];
    if (!first) throw new Error("Expected candidate");
    first.entity.metadata.title = "detached";
    expect(store.entities.get("near")?.metadata["title"]).toBe("near");
    expect(
      (
        await nearest(note, "question", {
          ...options,
          limit: 1,
          publishedOnly: true,
          excludeIds: ["near"],
        })
      )[0]?.entity.id,
    ).toBe("second");
  });
  test("preserves nonblank query bytes rather than trimming authored markdown", async () => {
    const { service } = await fixture();
    const search = spyOn(service, "searchWithDistances");
    const nearest = createJobEntityAccess(
      service,
      new Set(["note"]),
      "owner",
    ).nearest;
    const query = "\n---\ntitle: A question\n---\nAn answer.\n";
    await nearest(note, query, options);
    expect(search.mock.calls[0]?.[0].query).toBe(query);
    expect(await code(nearest(note, " ".repeat(100_000) + "x", options))).toBe(
      "invalid_input",
    );
    expect(search).toHaveBeenCalledTimes(1);
  });
  test("ownership and caller scope refuse before embedding, including a mutated owned set", async () => {
    const { service } = await fixture();
    const query = spyOn(service, "searchWithDistances");
    const owned = new Set(["note"]);
    const nearest = createOwnedEntityNearest(service, owned, "public");
    owned.add("other");
    expect(await code(nearest(other, "q", options))).toBe("permission_denied");
    expect(
      await code(nearest(note, "q", { ...options, visibility: "restricted" })),
    ).toBe("permission_denied");
    expect(query).not.toHaveBeenCalled();
  });
  test("scoped publication and visibility cannot be lowered by options", async () => {
    const { service } = await fixture();
    const nearest = createOwnedEntityNearest(
      scopeEntityReads(service, {
        publishedOnly: true,
        visibilityScope: "public",
      }),
      new Set(["note"]),
    );
    expect(
      (
        await nearest(note, "q", { ...options, limit: 1, publishedOnly: false })
      )[0]?.entity.id,
    ).toBe("near");
    expect(
      await nearest(note, "q", { ...options, visibility: "restricted" }),
    ).toEqual([]);
  });
  test("bounds and malformed definitions are rejected without backend work", async () => {
    const { service } = await fixture();
    const query = spyOn(service, "searchWithDistances");
    const nearest = createOwnedEntityNearest(service, new Set(["note"]));
    for (const limit of [0, -1, 101, 1.5, Infinity, NaN])
      expect(await code(nearest(note, "q", { ...options, limit }))).toBe(
        "invalid_input",
      );
    for (const maxDistance of [-1, 3, Infinity, NaN])
      expect(await code(nearest(note, "q", { ...options, maxDistance }))).toBe(
        "invalid_input",
      );
    expect(await code(nearest(note, "", options))).toBe("invalid_input");
    expect(
      await code(
        nearest(note, "q", {
          ...options,
          excludeIds: Array.from({ length: 101 }, () => "id"),
        }),
      ),
    ).toBe("invalid_input");
    expect(query).not.toHaveBeenCalled();
  });
  test("oversized backend responses refuse rather than slice an unbounded retrieval", async () => {
    const { service } = await fixture();
    spyOn(service, "searchWithDistances").mockResolvedValue(
      Array.from({ length: 3 }, () => ({
        entityType: "note",
        entityId: "near",
        distance: 0.1,
      })),
    );
    const read = spyOn(service, "getEntity");
    expect(
      await code(
        createOwnedEntityNearest(service, new Set(["note"]))(
          note,
          "q",
          options,
        ),
      ),
    ).toBe("invalid_response");
    expect(read).not.toHaveBeenCalled();
  });
  test("rechecks type, distance, exclusion and visibility; never exposes raw rows", async () => {
    const { service } = await fixture();
    spyOn(service, "searchWithDistances").mockResolvedValue([
      { entityType: "other", entityId: "foreign", distance: 0.01 },
      { entityType: "note", entityId: "private", distance: 0.02 },
      { entityType: "note", entityId: "far", distance: 0.9 },
      { entityType: "note", entityId: "near", distance: 0.1 },
      { entityType: "note", entityId: "second", distance: 0.2 },
    ]);
    const result = await createOwnedEntityNearest(service, new Set(["note"]))(
      note,
      "q",
      { ...options, limit: 5, excludeIds: ["near"] },
    );
    expect(result.map((row) => row.entity.id)).toEqual(["second"]);
    expect(Object.keys(result[0] ?? {})).toEqual(["entity", "distance"]);
  });
  test("cancellation before and after search refuses subsequent point reads", async () => {
    const { service } = await fixture();
    const controller = new AbortController();
    const nearest = createOwnedEntityNearest(
      service,
      new Set(["note"]),
      undefined,
      controller.signal,
    );
    const query = spyOn(service, "searchWithDistances").mockImplementation(
      async () => {
        controller.abort();
        return [{ entityType: "note", entityId: "near", distance: 0.1 }];
      },
    );
    const read = spyOn(service, "getEntity");
    expect(await code(nearest(note, "q", options))).toBe("cancelled");
    expect(await code(nearest(note, "q", options))).toBe("cancelled");
    expect(query).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });
  test("snapshots requests and declarations before awaiting the backend", async () => {
    const { service } = await fixture();
    const gate = Promise.withResolvers<void>();
    const query = spyOn(service, "searchWithDistances").mockImplementation(
      async () => {
        await gate.promise;
        return [{ entityType: "note", entityId: "second", distance: 0.2 }];
      },
    );
    const declaration = { ...note, type: "note" };
    const request = { ...options, excludeIds: ["near"] };
    const pending = createOwnedEntityNearest(service, new Set(["note"]))(
      declaration,
      "q",
      request,
    );
    declaration.type = "other";
    request.excludeIds.push("second");
    request.limit = 1;
    gate.resolve();
    expect((await pending)[0]?.entity.entityType).toBe("note");
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      types: ["note"],
      excludeIds: ["near"],
      limit: 2,
    });
  });
  test("a visibility change between query and lookup cannot reach confirmation", async () => {
    const { service } = await fixture();
    const stored = await service.getEntity({ entityType: "note", id: "near" });
    if (!stored) throw new Error("Missing fixture");
    spyOn(service, "searchWithDistances").mockImplementation(async () => {
      await service.updateEntity({
        entity: { ...stored, visibility: "restricted" },
      });
      return [{ entityType: "note", entityId: "near", distance: 0.1 }];
    });
    expect(
      await createOwnedEntityNearest(service, new Set(["note"]))(
        note,
        "q",
        options,
      ),
    ).toEqual([]);
  });
  test("native failures are sanitized with local causes", async () => {
    const { service } = await fixture();
    const cause = new Error("private sqlite path");
    spyOn(service, "searchWithDistances").mockRejectedValue(cause);
    const error: unknown = await createOwnedEntityNearest(
      service,
      new Set(["note"]),
    )(note, "q", options).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SdkError);
    if (!(error instanceof SdkError)) throw new Error("Expected SDK error");
    expect(error.code).toBe("handler_failed");
    expect(error.cause).toBe(cause);
    expect(JSON.stringify(error)).not.toContain("private sqlite path");
  });
});
