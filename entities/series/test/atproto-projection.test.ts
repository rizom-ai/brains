import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { createSeriesAtprotoProjection } from "../src/atproto-projection";
import { SeriesPlugin } from "../src/plugin";
import { seriesAdapter } from "../src/adapters/series-adapter";
import type { Series } from "../src/schemas/series";

const series: Series = {
  id: "series-1",
  entityType: "series",
  content: seriesAdapter.toMarkdown({
    id: "series-1",
    entityType: "series",
    content:
      "---\ntitle: ATProto Series\nslug: atproto-series\n---\n## Description\n\nA sequence about AT Protocol.",
    created: "2026-05-28T10:00:00.000Z",
    updated: "2026-05-28T11:00:00.000Z",
    visibility: "public",
    contentHash: "hash",
    metadata: { title: "ATProto Series", slug: "atproto-series" },
  }),
  created: "2026-05-28T10:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: { title: "ATProto Series", slug: "atproto-series" },
};

describe("series ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps series to ai.rizom.brain.series records", async () => {
    const projection = createSeriesAtprotoProjection();

    const record = await projection.buildRecord({
      entity: series,
      context: createPluginHarness().getServiceContext("series"),
      config: {
        enabled: true,
        pdsEndpoint: "https://bsky.social",
        brainDid: "did:web:brain.example.com",
      },
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.series",
      title: "ATProto Series",
      slug: "atproto-series",
      description: "A sequence about AT Protocol.",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "series",
      sourceEntityId: "series-1",
      createdAt: "2026-05-28T10:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("registers the series projection when the series plugin registers", async () => {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-series-atproto",
    });
    await harness.installPlugin(new SeriesPlugin());

    const projection = AtprotoProjectionRegistry.getInstance().get("series");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.series");
  });
});
