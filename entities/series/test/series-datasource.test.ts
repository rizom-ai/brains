import { createMockEntityService } from "@brains/entity-service/test";
import { describe, expect, it } from "bun:test";
import type { BaseEntity, ListEntitiesRequest } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { SeriesDataSource } from "../src/datasources/series-datasource";

function entity(input: {
  id: string;
  entityType: string;
  content?: string;
  metadata: Record<string, unknown>;
}): BaseEntity {
  return {
    id: input.id,
    entityType: input.entityType,
    content: input.content ?? `# ${input.id}`,
    contentHash: `hash:${input.id}`,
    metadata: input.metadata,
    visibility: "public",
    created: "2025-01-01T00:00:00.000Z",
    updated: "2025-01-01T00:00:00.000Z",
  };
}

const series = entity({
  id: "craft",
  entityType: "series",
  content: "---\ntitle: Craft\nslug: craft\n---\n",
  metadata: { title: "Craft", slug: "craft" },
});

async function memberListRequests(
  query: unknown,
): Promise<ListEntitiesRequest[]> {
  const entities = [
    series,
    entity({
      id: "post-1",
      entityType: "post",
      metadata: { seriesName: "Craft" },
    }),
    entity({ id: "cover", entityType: "image", metadata: {} }),
  ];
  const requests: ListEntitiesRequest[] = [];
  const entityService = createMockEntityService({
    entityTypes: ["series", "post", "image"],
    listEntitiesImpl: async (request) => {
      requests.push(request);
      return entities.filter(
        (candidate) => candidate.entityType === request.entityType,
      );
    },
  });
  await new SeriesDataSource(createSilentLogger()).fetch(query, z.unknown(), {
    entityService,
  });
  return requests.filter((request) => request.entityType !== "series");
}

describe("SeriesDataSource", () => {
  it("counts members across types without loading binary content", async () => {
    const requests = await memberListRequests({ type: "list" });

    expect(requests.map((request) => request.entityType)).toEqual([
      "post",
      "image",
    ]);
    for (const request of requests) {
      expect(request.options?.binaryContent).toBe("reference");
    }
  });

  it("finds series members without loading binary content", async () => {
    const requests = await memberListRequests({
      type: "detail",
      seriesName: "Craft",
    });

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.options?.binaryContent).toBe("reference");
    }
  });
});
