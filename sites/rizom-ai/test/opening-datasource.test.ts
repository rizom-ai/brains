import { describe, expect, test } from "bun:test";
import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { openingSchema } from "../src/opening";
import {
  RizomOpeningDataSource,
  type OpeningLoaders,
} from "../src/opening-datasource";

const map = {
  center: { kind: "identity" },
  nodes: [
    {
      id: "jo",
      name: "Jo",
      kind: "person",
      status: "approved",
      tags: [],
      distance: 0.48,
      bearing: 300,
    },
  ],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0.48, max: 0.48 },
  pendingCount: 0,
};

const mapSource: DataSource = {
  id: "agent-discovery:proximity-map",
  name: "map",
  description: "the live map",
  async fetch<T>(
    _query: unknown,
    schema: { parse(value: unknown): T },
  ): Promise<T> {
    return schema.parse(map);
  },
};

const context: BaseDataSourceContext = {
  publishedOnly: false,
  entityService: createMockShell().getEntityService(),
};

describe("the opening's data", () => {
  test("is the live map with the Ask topics and the box's availability", async () => {
    const loaders: OpeningLoaders = {
      mapSource: () => mapSource,
      loadOpening: async () => ({
        title: "What’s on your mind?",
        topics: ["Where would I start?"],
      }),
      chatAvailable: async () => true,
    };
    const source = new RizomOpeningDataSource(loaders);
    const data = await source.fetch({}, openingSchema, context);
    expect(data.nodes.map((node) => node.id)).toEqual(["jo"]);
    expect(data.topics).toEqual(["Where would I start?"]);
    expect(data.prompt).toBe("What’s on your mind?");
    expect(data.askBox).toBe(true);
  });

  test("still opens, on an empty map and without the box, when nothing else is there", async () => {
    const loaders: OpeningLoaders = {
      mapSource: () => undefined,
      loadOpening: async () => null,
      chatAvailable: async () => false,
    };
    const source = new RizomOpeningDataSource(loaders);
    const data = await source.fetch({}, openingSchema, context);
    expect(data.nodes).toEqual([]);
    expect(data.topics).toEqual([]);
    expect(data.prompt).toBeNull();
    expect(data.askBox).toBe(false);
  });
});
