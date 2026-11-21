import { describe, expect, it } from "bun:test";
import {
  findEntityByIdentifier,
  resolveEntityOrError,
} from "../src/find-entity";
import { getErrorMessage } from "@brains/utils/error";
import { createMockEntityService } from "../src/test/mock-entity-service";
import type {
  BaseEntity,
  EntitySearchRequest,
  EntityTypeConfig,
  GetEntityRawRequest,
  GetEntityRequest,
  ICoreEntityService,
  ListEntitiesRequest,
  SearchResult,
} from "../src/types";

interface CapturedService {
  service: ICoreEntityService;
  getEntityCalls: GetEntityRequest[];
  listEntitiesCalls: ListEntitiesRequest[];
}

function createCapturedService(): CapturedService {
  const getEntityCalls: GetEntityRequest[] = [];
  const listEntitiesCalls: ListEntitiesRequest[] = [];

  const service: ICoreEntityService = {
    async getEntity<T extends BaseEntity>(
      _request: GetEntityRequest,
    ): Promise<T | null> {
      return null;
    },
    async getEntityRaw<T extends BaseEntity>(
      request: GetEntityRawRequest,
    ): Promise<T | null> {
      getEntityCalls.push(request);
      return null;
    },
    async listEntities<T extends BaseEntity>(
      request: ListEntitiesRequest,
    ): Promise<T[]> {
      listEntitiesCalls.push(request);
      return [];
    },
    async search<T extends BaseEntity = BaseEntity>(
      _request: EntitySearchRequest,
    ): Promise<SearchResult<T>[]> {
      return [];
    },
    queryEntityHierarchy: createMockEntityService().queryEntityHierarchy,
    openAsset: createMockEntityService().openAsset,
    readAsset: createMockEntityService().readAsset,
    statAsset: createMockEntityService().statAsset,
    queryGroupingCatalog: createMockEntityService().queryGroupingCatalog,
    queryGroupingMembers: createMockEntityService().queryGroupingMembers,
    queryGroupingUsage: createMockEntityService().queryGroupingUsage,
    searchWithDistances: async () => [],
    nearestToEntity: async () => [],
    projectSemanticSpace: async () => ({
      origin: { kind: "centroid" },
      points: [],
      neighbors: [],
      distanceRange: { min: 0, max: 0 },
    }),
    getEntityTypes: () => [],
    hasEntityType: () => true,
    countEntities: async () => 0,
    getEntityCounts: async () => [],
    getEntityTypeConfig: (): EntityTypeConfig => ({}),
    fileExtension: (): ".md" | ".yaml" => ".md",
    getWeightMap: () => ({}),
  };

  return { service, getEntityCalls, listEntitiesCalls };
}

describe("findEntityByIdentifier scope propagation", () => {
  it("propagates the caller's scope and cancellation to every lookup without extra authority", async () => {
    const captured = createCapturedService();
    const signal = new AbortController().signal;
    // A structurally compatible object may contain extra runtime properties.
    await findEntityByIdentifier(
      captured.service,
      { entityType: "doc", identifier: "missing" },
      {
        visibilityScope: "public",
        read: { signal, ...{ visibilityScope: "restricted" } },
      },
    );
    expect(captured.getEntityCalls).toEqual([
      { entityType: "doc", id: "missing", visibilityScope: "public", signal },
    ]);
    expect(captured.listEntitiesCalls).toHaveLength(4);
    for (const request of captured.listEntitiesCalls) {
      expect(request.options).toMatchObject({
        signal,
        filter: { visibilityScope: "public" },
      });
    }
  });

  it("carries publishedOnly to the direct lookup and every fallback", async () => {
    const captured = createCapturedService();
    await findEntityByIdentifier(
      captured.service,
      { entityType: "doc", identifier: "missing" },
      { visibilityScope: "public", read: { publishedOnly: true } },
    );
    expect(captured.getEntityCalls).toEqual([
      {
        entityType: "doc",
        id: "missing",
        visibilityScope: "public",
        publishedOnly: true,
      },
    ]);
    expect(captured.listEntitiesCalls).toHaveLength(4);
    for (const request of captured.listEntitiesCalls) {
      expect(request.options).toMatchObject({ publishedOnly: true });
    }
  });

  it("starts no fallback after cancellation during a slow direct read", async () => {
    const captured = createCapturedService();
    const controller = new AbortController();
    const reads = {
      ...captured.service,
      getEntityRaw: async (): Promise<null> => {
        controller.abort();
        return null;
      },
    };
    expect(
      await findEntityByIdentifier(
        reads,
        { entityType: "doc", identifier: "missing" },
        { visibilityScope: "public", read: { signal: controller.signal } },
      ).catch(() => null),
    ).toBeNull();
    expect(captured.listEntitiesCalls).toHaveLength(0);
  });

  it("forwards visibility scope to the direct id lookup", async () => {
    const captured = createCapturedService();
    await findEntityByIdentifier(
      captured.service,
      { entityType: "doc", identifier: "abc" },
      { visibilityScope: "public" },
    );

    expect(captured.getEntityCalls[0]).toEqual({
      entityType: "doc",
      id: "abc",
      visibilityScope: "public",
    });
  });

  it("forwards visibility scope to the slug fallback lookup", async () => {
    const captured = createCapturedService();
    await findEntityByIdentifier(
      captured.service,
      { entityType: "doc", identifier: "my-slug" },
      { visibilityScope: "shared" },
    );

    expect(captured.listEntitiesCalls[0]).toEqual({
      entityType: "doc",
      options: {
        limit: 1,
        filter: {
          metadata: { slug: "my-slug" },
          visibilityScope: "shared",
        },
      },
    });
  });

  it("forwards visibility scope to the title fallback lookup", async () => {
    const captured = createCapturedService();
    await findEntityByIdentifier(
      captured.service,
      { entityType: "doc", identifier: "My Title" },
      { visibilityScope: "restricted" },
    );

    expect(captured.listEntitiesCalls[1]).toEqual({
      entityType: "doc",
      options: {
        limit: 1,
        filter: {
          metadata: { title: "My Title" },
          visibilityScope: "restricted",
        },
      },
    });
  });

  it("resolves an entity when the identifier is a slugified title", async () => {
    const captured = createCapturedService();
    const entity: BaseEntity = {
      id: "resilience-in-distributed-systems",
      entityType: "doc",
      content: "content",
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      visibility: "public",
      metadata: { title: "Resilience Is Not Redundancy" },
      contentHash: "hash",
    };
    captured.service.listEntities = async (
      request: ListEntitiesRequest,
    ): Promise<BaseEntity[]> => {
      captured.listEntitiesCalls.push(request);
      const metadata = request.options?.filter?.metadata;
      if (metadata !== undefined) return [];
      return [entity];
    };

    const result = await findEntityByIdentifier(
      captured.service,
      { entityType: "doc", identifier: "resilience-is-not-redundancy" },
      { visibilityScope: "public" },
    );

    expect(result?.id).toBe("resilience-in-distributed-systems");
    expect(captured.listEntitiesCalls.at(-1)).toEqual({
      entityType: "doc",
      options: { limit: 200, filter: { visibilityScope: "public" } },
    });
  });

  it("returns null when the entity exists but is out of the public scope", async () => {
    const captured = createCapturedService();

    const result = await findEntityByIdentifier(
      captured.service,
      { entityType: "doc", identifier: "restricted-id" },
      { visibilityScope: "public" },
    );

    expect(result).toBeNull();
  });

  it("propagates a lookup failure instead of reporting the entity missing", async () => {
    // A store that cannot answer has not told us the entity is absent.
    // Reporting "not found" sends the caller looking for a missing entity
    // rather than a broken store, and every system entity tool renders that
    // null as exactly that message.
    const unreachable: ICoreEntityService = {
      ...createCapturedService().service,
      async getEntityRaw<T extends BaseEntity>(): Promise<T | null> {
        throw new Error("database unreachable");
      },
    };

    const outcome = await findEntityByIdentifier(
      unreachable,
      { entityType: "doc", identifier: "abc" },
      { visibilityScope: "public" },
    ).then(
      (entity) => `resolved with ${String(entity)}`,
      (error: unknown) => getErrorMessage(error),
    );

    expect(outcome).toBe("database unreachable");
  });

  it("resolveEntityOrError surfaces a not-found error for out-of-scope entities", async () => {
    const captured = createCapturedService();

    const result = await resolveEntityOrError(
      captured.service,
      { entityType: "doc", identifier: "restricted-id" },
      { visibilityScope: "public" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Entity not found: doc/restricted-id");
    }
  });

  it("resolveEntityOrError prefixes the not-found error with the caller's label", async () => {
    const captured = createCapturedService();

    const result = await resolveEntityOrError(
      captured.service,
      { entityType: "doc", identifier: "missing" },
      { visibilityScope: "shared", label: "Source entity" },
    );

    expect(result).toEqual({
      ok: false,
      error: "Source entity not found: doc/missing",
    });
  });
});

// A plain note saved under a name keeps that name only in its id: its file
// states no title, so its title is its first line.
describe("findEntityByIdentifier by the name an entry was saved under", () => {
  const saved: BaseEntity = {
    id: "dashboard-drop-off",
    entityType: "note",
    content: "Sam stopped opening the dashboard after a week.",
    contentHash: "hash",
    visibility: "restricted",
    created: "2026-11-15T10:00:00.000Z",
    updated: "2026-11-15T10:00:00.000Z",
    metadata: { title: "Sam stopped opening the dashboard after a week." },
  };

  function holding(entity: BaseEntity): CapturedService {
    const captured = createCapturedService();
    return {
      ...captured,
      service: {
        ...captured.service,
        async getEntityRaw<T extends BaseEntity>(
          request: GetEntityRawRequest,
        ): Promise<T | null> {
          captured.getEntityCalls.push(request);
          // Read through a schema-free copy: the test holds one entry.
          return request.id === entity.id &&
            request.entityType === entity.entityType
            ? structuredClone<T>(JSON.parse(JSON.stringify(entity)))
            : null;
        },
      },
    };
  }

  it("finds the entry whose id is the name's slug", async () => {
    const captured = holding(saved);

    const found = await findEntityByIdentifier(
      captured.service,
      { entityType: "note", identifier: "Dashboard drop-off" },
      { visibilityScope: "restricted" },
    );

    expect(found?.id).toBe("dashboard-drop-off");
  });

  it("reads it at the caller's scope, after an entry titled so and before looser matches", async () => {
    const captured = holding(saved);
    const signal = new AbortController().signal;

    await findEntityByIdentifier(
      captured.service,
      { entityType: "note", identifier: "Dashboard drop-off" },
      { visibilityScope: "public", read: { signal, publishedOnly: true } },
    );

    expect(captured.getEntityCalls).toEqual([
      {
        entityType: "note",
        id: "Dashboard drop-off",
        visibilityScope: "public",
        signal,
        publishedOnly: true,
      },
      {
        entityType: "note",
        id: "dashboard-drop-off",
        visibilityScope: "public",
        signal,
        publishedOnly: true,
      },
    ]);
    // By slug and by title first; nothing looser once the id answered.
    expect(captured.listEntitiesCalls).toHaveLength(2);
  });

  it("looks no entry up twice when the name is its own slug", async () => {
    const captured = createCapturedService();

    await findEntityByIdentifier(
      captured.service,
      { entityType: "note", identifier: "missing" },
      { visibilityScope: "public" },
    );

    expect(captured.getEntityCalls).toHaveLength(1);
  });
});
