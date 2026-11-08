import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { buildSeriesAtprotoRecord, type Series } from "../src";
import { seriesPlugin } from "./series-plugin";

// A series as a declared type reads it: its metadata and its body.
const series: Series = {
  id: "series-1",
  entityType: "series",
  content:
    "# ATProto Series\n\n## Description\nA sequence about AT Protocol.\n",
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

function recordInput(
  overrides: Partial<Parameters<typeof buildSeriesAtprotoRecord>[0]> = {},
): Parameters<typeof buildSeriesAtprotoRecord>[0] {
  return {
    entity: series,
    config: {},
    dryRun: false,
    entities: {
      get: async () => null,
      list: async () => [],
      count: async () => 0,
    },
    uploadBlob: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("series ATProto projection", () => {
  it("maps series to ai.rizom.brain.series records", async () => {
    const record = await buildSeriesAtprotoRecord(
      recordInput({ config: { brainDid: "did:web:brain.example.com" } }),
    );

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

  it("names its page when the site gives the series one, and nothing otherwise", async () => {
    const placed = await buildSeriesAtprotoRecord(
      recordInput({ pageUrl: "https://brain.example.com/seriess/series-1" }),
    );
    expect(placed.canonicalUrl).toBe(
      "https://brain.example.com/seriess/series-1",
    );
    const unplaced = await buildSeriesAtprotoRecord(recordInput());
    expect(unplaced.canonicalUrl).toBeUndefined();
  });

  it("registers the series projection when the series plugin registers", async () => {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-series-atproto",
    });
    await harness.installPlugin(seriesPlugin());

    const projection = harness
      .getMockShell()
      .getAtprotoProjectionRegistry()
      .get("series");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.series");
    expect(projection?.validate).toBe(false);
  });
});
