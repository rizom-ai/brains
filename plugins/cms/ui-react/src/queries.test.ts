import { afterEach, describe, expect, it } from "bun:test";
import { QueryObserver, type QueryObserverResult } from "@tanstack/react-query";
import { mockFetch } from "@brains/test-utils";
import type { EntitySummary } from "./api";
import { createCmsQueryClient } from "./query-client";
import { cmsKeys, entityListQueryOptions } from "./queries";

const originalFetch = globalThis.fetch;

function entity(title: string): EntitySummary {
  return {
    id: "field-notes",
    entityType: "post",
    frontmatter: { title },
    updated: "2026-07-14T09:00:00.000Z",
  };
}

function entitiesResponse(entities: EntitySummary[]): Response {
  return Response.json({ entities });
}

function waitForResult<TQueryKey extends readonly unknown[]>(
  observer: QueryObserver<
    EntitySummary[],
    Error,
    EntitySummary[],
    EntitySummary[],
    TQueryKey
  >,
  predicate: (result: QueryObserverResult<EntitySummary[], Error>) => boolean,
): Promise<QueryObserverResult<EntitySummary[], Error>> {
  return new Promise((resolve) => {
    const unsubscribe = observer.subscribe((result) => {
      if (!predicate(result)) return;
      unsubscribe();
      resolve(result);
    });
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CMS entity-list query", () => {
  it("uses a stable key scoped by entity type", () => {
    expect(cmsKeys.entities("post")).toEqual(["cms", "entities", "post"]);
    expect(cmsKeys.entities("note")).toEqual(["cms", "entities", "note"]);
  });

  it("deduplicates the mounted query and initialization read", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return entitiesResponse([entity("Notes from the rhizome")]);
    });
    const client = createCmsQueryClient();
    const options = entityListQueryOptions("post");
    const observer = new QueryObserver(client, options);
    const statuses: string[] = [];
    const unsubscribe = observer.subscribe((result) => {
      statuses.push(result.status);
    });

    const initialized = await client.ensureQueryData(options);

    expect(initialized).toHaveLength(1);
    expect(statuses).toContain("pending");
    expect(observer.getCurrentResult().status).toBe("success");
    expect(requests).toBe(1);
    unsubscribe();
    client.clear();
  });

  it("surfaces an entity-list error without retrying", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json(
        { error: "Entity list unavailable" },
        { status: 503 },
      );
    });
    const client = createCmsQueryClient();
    const observer = new QueryObserver(client, entityListQueryOptions("post"));
    const resultPromise = waitForResult(
      observer,
      (result) => result.status === "error",
    );

    const result = await resultPromise;

    expect(result.error?.message).toBe("Entity list unavailable");
    expect(requests).toBe(1);
    client.clear();
  });

  it("refetches one active list after targeted invalidation", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return entitiesResponse([
        entity(requests === 1 ? "Before mutation" : "After mutation"),
      ]);
    });
    const client = createCmsQueryClient();
    const observer = new QueryObserver(client, entityListQueryOptions("post"));
    let resolveFirst: (() => void) | undefined;
    let resolveRefreshed:
      | ((result: QueryObserverResult<EntitySummary[], Error>) => void)
      | undefined;
    const firstResult = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const refreshedResult = new Promise<
      QueryObserverResult<EntitySummary[], Error>
    >((resolve) => {
      resolveRefreshed = resolve;
    });
    const unsubscribe = observer.subscribe((result) => {
      const title = result.data?.[0]?.frontmatter["title"];
      if (title === "Before mutation") resolveFirst?.();
      if (title === "After mutation") resolveRefreshed?.(result);
    });
    await firstResult;

    await client.invalidateQueries({ queryKey: cmsKeys.entities("post") });
    const refreshed = await refreshedResult;

    expect(refreshed.data?.[0]?.frontmatter["title"]).toBe("After mutation");
    expect(requests).toBe(2);
    unsubscribe();
    client.clear();
  });
});
