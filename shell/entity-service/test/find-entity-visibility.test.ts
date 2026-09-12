import { describe, expect, it } from "bun:test";
import {
  findEntityByIdentifier,
  resolveEntityOrError,
} from "../src/find-entity";
import { getErrorMessage } from "@brains/utils/error";
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
      request: GetEntityRequest,
    ): Promise<T | null> {
      getEntityCalls.push(request);
      return null;
    },
    async getEntityRaw<T extends BaseEntity>(
      _request: GetEntityRawRequest,
    ): Promise<T | null> {
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
    searchWithDistances: async () => [],
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
    getWeightMap: () => ({}),
  };

  return { service, getEntityCalls, listEntitiesCalls };
}

describe("findEntityByIdentifier scope propagation", () => {
  it("propagates bounded reads to exact fallbacks without a broad scan or extra authority", async () => {
    const captured = createCapturedService();
    const readBudget = { rows: 1, rowBytes: 1000, queryCharacters: 40 };
    const signal = new AbortController().signal;
    // A structurally compatible object may contain extra runtime properties.
    await findEntityByIdentifier(
      captured.service,
      "doc",
      "missing",
      undefined,
      "public",
      { readBudget, signal, ...{ visibilityScope: "restricted" } },
    );
    expect(captured.getEntityCalls).toEqual([
      {
        entityType: "doc",
        id: "missing",
        visibilityScope: "public",
        readBudget,
        signal,
      },
    ]);
    expect(captured.listEntitiesCalls).toHaveLength(3);
    for (const request of captured.listEntitiesCalls) {
      expect(request.options).toMatchObject({
        readBudget,
        signal,
        limit: 1,
        filter: { visibilityScope: "public" },
      });
    }
  });

  it("starts no fallback after cancellation during a slow direct read", async () => {
    const captured = createCapturedService();
    const controller = new AbortController();
    const reads = {
      ...captured.service,
      getEntity: async (): Promise<null> => {
        controller.abort();
        return null;
      },
    };
    expect(
      await findEntityByIdentifier(
        reads,
        "doc",
        "missing",
        undefined,
        "public",
        {
          readBudget: { rows: 1, rowBytes: 1000, queryCharacters: 40 },
          signal: controller.signal,
        },
      ).catch(() => null),
    ).toBeNull();
    expect(captured.listEntitiesCalls).toHaveLength(0);
  });

  it("forwards visibility scope to the direct id lookup", async () => {
    const captured = createCapturedService();
    await findEntityByIdentifier(
      captured.service,
      "doc",
      "abc",
      undefined,
      "public",
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
      "doc",
      "my-slug",
      undefined,
      "shared",
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
      "doc",
      "My Title",
      undefined,
      "restricted",
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
      "doc",
      "resilience-is-not-redundancy",
      undefined,
      "public",
    );

    expect(result?.id).toBe("resilience-in-distributed-systems");
    expect(captured.listEntitiesCalls.at(-1)).toEqual({
      entityType: "doc",
      options: { limit: 200, filter: { visibilityScope: "public" } },
    });
  });

  it("defaults to public scope when none is provided", async () => {
    const captured = createCapturedService();
    await findEntityByIdentifier(captured.service, "doc", "abc");

    expect(captured.getEntityCalls[0]).toEqual({
      entityType: "doc",
      id: "abc",
      visibilityScope: "public",
    });
  });

  it("returns null when the entity exists but is out of the public scope", async () => {
    const captured = createCapturedService();

    const result = await findEntityByIdentifier(
      captured.service,
      "doc",
      "restricted-id",
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
      async getEntity<T extends BaseEntity>(): Promise<T | null> {
        throw new Error("database unreachable");
      },
    };

    const outcome = await findEntityByIdentifier(
      unreachable,
      "doc",
      "abc",
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
      "doc",
      "restricted-id",
      undefined,
      undefined,
      "public",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Entity not found: doc/restricted-id");
    }
  });
});
