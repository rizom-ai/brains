import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import type { BaseEntity, ListEntitiesRequest } from "@brains/plugins";
import {
  SOURCE_PAGE_SIZE,
  readTopicSourcePages,
} from "../../src/lib/topic-source-pages";

function makeNote(
  id: string,
  visibility: BaseEntity["visibility"] = "public",
  status = "published",
): BaseEntity {
  return {
    id,
    entityType: "note",
    content: `Body of ${id}.`,
    contentHash: `hash-${id}`,
    visibility,
    metadata: { status },
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

const ids = (source: BaseEntity): string[] => [source.id];

describe("readTopicSourcePages", () => {
  it("reads every source past the first page, sorted by id", async () => {
    // Inserted in reverse, so the order read is the sort, not insertion.
    const notes = Array.from({ length: SOURCE_PAGE_SIZE + 1 }, (_, index) =>
      makeNote(`note-${String(index).padStart(3, "0")}`),
    ).reverse();
    const shell = createMockShell();
    shell.addEntities(notes);
    const requests: ListEntitiesRequest[] = [];
    const service = shell.getEntityService();
    const listEntities = service.listEntities.bind(service);

    const read = await readTopicSourcePages(
      {
        listEntities: (request: ListEntitiesRequest) => {
          requests.push(request);
          return listEntities(request);
        },
      },
      { entityType: "note", filter: { visibilityScope: "public" } },
      ids,
    );

    expect(read).toEqual(notes.map(({ id }) => id).sort());
    expect(requests.map((request) => request.options?.offset)).toEqual([
      0,
      SOURCE_PAGE_SIZE,
    ]);
    expect(
      requests.every(
        (request) =>
          request.options?.limit === SOURCE_PAGE_SIZE &&
          request.options.sortFields?.[0]?.field === "id",
      ),
    ).toBe(true);
  });

  it("passes the visibility filter and published-only through", async () => {
    const shell = createMockShell();
    shell.addEntities([
      makeNote("public"),
      makeNote("draft", "public", "draft"),
      makeNote("shared", "shared"),
      makeNote("restricted", "restricted"),
    ]);
    const service = shell.getEntityService();

    const shared = await readTopicSourcePages(
      service,
      { entityType: "note", filter: { visibilityScope: "shared" } },
      ids,
    );
    expect(shared.sort()).toEqual(["draft", "public", "shared"]);

    const publishedPublic = await readTopicSourcePages(
      service,
      {
        entityType: "note",
        filter: { visibilityScope: "public" },
        publishedOnly: true,
      },
      ids,
    );
    expect(publishedPublic).toEqual(["public"]);
  });

  it("keeps what the mapper returns for each source", async () => {
    const shell = createMockShell();
    shell.addEntities([makeNote("kept"), makeNote("dropped")]);

    const read = await readTopicSourcePages(
      shell.getEntityService(),
      { entityType: "note", filter: { visibilityScope: "public" } },
      (source) =>
        source.id === "kept" ? [`${source.id}:${source.contentHash}`] : [],
    );

    expect(read).toEqual(["kept:hash-kept"]);
  });

  it("passes the caller's signal to every page read", async () => {
    const shell = createMockShell();
    shell.addEntities([makeNote("one")]);
    const service = shell.getEntityService();
    const listEntities = service.listEntities.bind(service);
    const { signal } = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];

    await readTopicSourcePages(
      {
        listEntities: (request: ListEntitiesRequest) => {
          signals.push(request.options?.signal);
          return listEntities(request);
        },
      },
      { entityType: "note", filter: { visibilityScope: "public" }, signal },
      ids,
    );

    expect(signals).toEqual([signal]);
  });
});
