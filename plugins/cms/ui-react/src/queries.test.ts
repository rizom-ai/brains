import { afterEach, describe, expect, it } from "bun:test";
import { QueryObserver, type QueryObserverResult } from "@tanstack/react-query";
import { mockFetch } from "@brains/test-utils";
import type {
  EntityDetail,
  EntitySummary,
  EntityTypeInfo,
  SyncStatus,
  TypeSchema,
} from "./api";
import { createEditorDocument } from "./editor-document";
import { createCmsQueryClient } from "./query-client";
import {
  agentTargetsQueryOptions,
  cmsKeys,
  entityDetailQueryOptions,
  entityListQueryOptions,
  entitySchemaQueryOptions,
  entityTypesQueryOptions,
  syncStatusQueryOptions,
} from "./queries";

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

function entityType(entityType: string): EntityTypeInfo {
  return {
    entityType,
    label: entityType === "post" ? "Posts" : "Notes",
    isSingleton: false,
    hasBody: true,
    count: 1,
  };
}

function syncStatus(lastCommit: string | null): SyncStatus {
  return {
    directorySync: { lastSync: "2026-07-14T09:00:00.000Z", watching: true },
    git: {
      branch: "main",
      hasChanges: false,
      ahead: 0,
      behind: 0,
      lastCommit,
      remote: "origin",
    },
  };
}

function entitySchema(entityType: string): TypeSchema {
  return {
    entityType,
    format: "frontmatter",
    isSingleton: false,
    hasBody: true,
    fields: [{ name: "title", label: "Title", widget: "string" }],
  };
}

function entityDetail(title: string, contentHash: string): EntityDetail {
  return {
    ...entity(title),
    body: "Body text",
    contentHash,
    created: "2026-07-14T08:00:00.000Z",
  };
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

describe("CMS entity-types query", () => {
  it("loads through one stable cache entry", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({ types: [entityType("post")] });
    });
    const client = createCmsQueryClient();
    const options = entityTypesQueryOptions();
    const observer = new QueryObserver(client, options);
    const statuses: string[] = [];
    const unsubscribe = observer.subscribe((result) => {
      statuses.push(result.status);
    });

    const initialized = await client.ensureQueryData(options);

    expect(cmsKeys.types()).toEqual(["cms", "types"]);
    expect(initialized).toEqual([entityType("post")]);
    expect(statuses).toContain("pending");
    expect(observer.getCurrentResult().status).toBe("success");
    expect(requests).toBe(1);
    unsubscribe();
    client.clear();
  });

  it("surfaces a type-list error without retrying", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({ error: "Types unavailable" }, { status: 503 });
    });
    const client = createCmsQueryClient();

    let caught: unknown;
    try {
      await client.fetchQuery(entityTypesQueryOptions());
    } catch (error: unknown) {
      caught = error;
    }

    if (!(caught instanceof Error)) throw caught;
    expect(caught.message).toBe("Types unavailable");
    expect(requests).toBe(1);
    client.clear();
  });
});

describe("CMS agent-targets query", () => {
  it("loads approved targets once through its own cache entry", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({
        agents: [{ id: "reviewer", label: "Reviewer" }],
      });
    });
    const client = createCmsQueryClient();

    const first = await client.fetchQuery(agentTargetsQueryOptions());
    const second = client.getQueryData(cmsKeys.agentTargets());

    expect(cmsKeys.agentTargets()).toEqual(["cms", "agent-targets"]);
    expect(first).toEqual([{ id: "reviewer", label: "Reviewer" }]);
    expect(second).toEqual(first);
    expect(requests).toBe(1);
    client.clear();
  });

  it("does not retry when optional agent discovery is unavailable", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({ error: "A2A unavailable" }, { status: 503 });
    });
    const client = createCmsQueryClient();

    try {
      await client.fetchQuery(agentTargetsQueryOptions());
    } catch {
      // The app treats absent query data as an empty optional target list.
    }

    expect(client.getQueryData(cmsKeys.agentTargets())).toBeUndefined();
    expect(requests).toBe(1);
    client.clear();
  });
});

describe("CMS sync-status query", () => {
  it("polls by invalidating one active cache entry", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json(syncStatus(requests === 1 ? "abc123" : "def456"));
    });
    const client = createCmsQueryClient();
    const observer = new QueryObserver(client, syncStatusQueryOptions());
    let resolveInitial: (() => void) | undefined;
    let resolveRefreshed: (() => void) | undefined;
    const initial = new Promise<void>((resolve) => {
      resolveInitial = resolve;
    });
    const refreshed = new Promise<void>((resolve) => {
      resolveRefreshed = resolve;
    });
    const unsubscribe = observer.subscribe((result) => {
      if (result.data?.git?.lastCommit === "abc123") resolveInitial?.();
      if (result.data?.git?.lastCommit === "def456") resolveRefreshed?.();
    });
    await initial;

    await client.invalidateQueries({ queryKey: cmsKeys.syncStatus() });
    await refreshed;

    expect(cmsKeys.syncStatus()).toEqual(["cms", "sync-status"]);
    expect(observer.getCurrentResult().data?.git?.lastCommit).toBe("def456");
    expect(requests).toBe(2);
    unsubscribe();
    client.clear();
  });
});

describe("CMS entity-schema query", () => {
  it("scopes schemas by type and avoids a duplicate observer request", async () => {
    const requestedUrls: string[] = [];
    mockFetch(async (url) => {
      requestedUrls.push(url);
      const type = new URL(url, "https://cms.test").searchParams.get("type");
      return Response.json(entitySchema(type ?? "unknown"));
    });
    const client = createCmsQueryClient();
    const postOptions = entitySchemaQueryOptions("post");

    await client.fetchQuery({ ...postOptions, staleTime: 0 });
    const observer = new QueryObserver(client, postOptions);
    const unsubscribe = observer.subscribe(() => {});
    await client.fetchQuery({
      ...entitySchemaQueryOptions("note"),
      staleTime: 0,
    });

    expect(cmsKeys.schema("post")).toEqual(["cms", "schema", "post"]);
    expect(observer.getCurrentResult().data?.entityType).toBe("post");
    expect(requestedUrls).toEqual([
      "/cms/api/schema?type=post",
      "/cms/api/schema?type=note",
    ]);
    unsubscribe();
    client.clear();
  });
});

describe("CMS entity-detail query", () => {
  it("loads explicitly once before mounting its cache observer", async () => {
    let requests = 0;
    mockFetch(async () => {
      requests += 1;
      return Response.json({ entity: entityDetail("Field notes", "hash-1") });
    });
    const client = createCmsQueryClient();
    const options = entityDetailQueryOptions("post", "field-notes");

    await client.fetchQuery({ ...options, staleTime: 0 });
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {});
    await Promise.resolve();

    expect(observer.getCurrentResult().data?.contentHash).toBe("hash-1");
    expect(requests).toBe(1);
    unsubscribe();
    client.clear();
  });

  it("keeps the mutable draft pinned when the server cache changes", () => {
    const client = createCmsQueryClient();
    const original = entityDetail("Original title", "hash-1");
    const document = createEditorDocument(original);
    client.setQueryData(cmsKeys.entity("post", "field-notes"), original);

    client.setQueryData(
      cmsKeys.entity("post", "field-notes"),
      entityDetail("Changed elsewhere", "hash-2"),
    );

    expect(document.entity.contentHash).toBe("hash-1");
    expect(document.draft["title"]).toBe("Original title");
    expect(document.draft).not.toBe(original.frontmatter);
    client.clear();
  });
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
