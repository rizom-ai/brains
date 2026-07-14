import { describe, expect, mock, test } from "bun:test";
import type {
  BaseDataSourceContext,
  SemanticSpaceProjection,
} from "@brains/plugins";
import { createMockEntityService } from "@brains/test-utils";
import { ProximityMapDataSource } from "../src/datasources/proximity-map-datasource";
import { proximityMapDataSchema } from "../src/lib/proximity-map-schema";
import { createTestAgent } from "./fixtures/agent";

describe("ProximityMapDataSource", () => {
  test("builds and validates public site map data", async () => {
    const agent = createTestAgent({
      id: "alpha",
      name: "Alpha",
      url: "https://alpha.example",
      status: "approved",
    });
    const projection: SemanticSpaceProjection = {
      origin: {
        kind: "entity",
        entityId: "brain-character",
        entityType: "brain-character",
      },
      points: [
        {
          entityId: "alpha",
          entityType: "agent",
          coordinates: [1, 0],
          distanceToOrigin: 0.3,
        },
      ],
      neighbors: [],
      distanceRange: { min: 0.3, max: 0.3 },
    };
    const projectSemanticSpace = mock(async () => projection);
    const entityService = {
      ...createMockEntityService({ returns: { listEntities: [agent] } }),
      projectSemanticSpace,
    } as BaseDataSourceContext["entityService"];

    const datasource = new ProximityMapDataSource();
    const result = await datasource.fetch({}, proximityMapDataSchema, {
      entityService,
    });

    expect(datasource.id).toBe("agent-discovery:proximity-map");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      id: "alpha",
      name: "Alpha",
      distance: 0.3,
      bearing: 0,
    });
    expect(projectSemanticSpace).toHaveBeenCalledWith({
      types: ["agent"],
      origin: {
        entityId: "brain-character",
        entityType: "brain-character",
      },
      maxNeighborDistance: 0.25,
    });
  });
});
