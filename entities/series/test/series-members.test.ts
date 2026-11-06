import { createMockEntityService } from "@brains/entity-service/test";
import { describe, expect, it } from "bun:test";
import type { BaseEntity, ListEntitiesRequest } from "@brains/plugins";
import { listSeriesCandidates } from "../src/lib/series-members";

function entity(id: string, entityType: string): BaseEntity {
  return {
    id,
    entityType,
    content: `# ${id}`,
    contentHash: `hash:${id}`,
    metadata: {},
    visibility: "public",
    created: "2025-01-01T00:00:00.000Z",
    updated: "2025-01-01T00:00:00.000Z",
  };
}

function reader(
  requests: ListEntitiesRequest[],
): ReturnType<typeof createMockEntityService> {
  const entities = [
    entity("craft", "series"),
    entity("post-1", "post"),
    entity("cover", "image"),
  ];
  return createMockEntityService({
    entityTypes: ["series", "post", "image"],
    listEntitiesImpl: async (request) => {
      requests.push(request);
      return entities.filter(
        (candidate) => candidate.entityType === request.entityType,
      );
    },
  });
}

describe("listSeriesCandidates", () => {
  it("lists every type but series, by reference", async () => {
    const requests: ListEntitiesRequest[] = [];

    const candidates = await listSeriesCandidates(reader(requests));

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "post-1",
      "cover",
    ]);
    expect(requests).toEqual([
      { entityType: "post", options: { binaryContent: "reference" } },
      { entityType: "image", options: { binaryContent: "reference" } },
    ]);
  });

  it("narrows to one series and bounds each type", async () => {
    const requests: ListEntitiesRequest[] = [];

    await listSeriesCandidates(reader(requests), {
      seriesName: "Craft",
      limit: 1,
    });

    expect(requests[0]).toEqual({
      entityType: "post",
      options: {
        filter: { metadata: { seriesName: "Craft" } },
        limit: 1,
        binaryContent: "reference",
      },
    });
  });
});
