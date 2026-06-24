import { describe, expect, it } from "bun:test";
import {
  findEntityByIdentifier,
  resolveEntityOrError,
} from "../src/find-entity";
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
    captured.service.listEntities = async <T extends BaseEntity>(
      request: ListEntitiesRequest,
    ): Promise<T[]> => {
      captured.listEntitiesCalls.push(request);
      const metadata = request.options?.filter?.metadata;
      if (metadata !== undefined) return [];
      return [entity as T];
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
