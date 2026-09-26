import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { createSeriesAtprotoProjection } from "../src/atproto-projection";

import type { Series } from "../src/schemas/series";

const series: Series = {
  id: "series-1",
  entityType: "series",
  content:
    "---\ntitle: ATProto Series\nslug: atproto-series\ncoverImageId: null\n---\n## Description\n\nA sequence about AT Protocol.",
  created: "2026-05-28T10:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    title: "ATProto Series",
    slug: "atproto-series",
    coverImageId: null,
  },
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
});
