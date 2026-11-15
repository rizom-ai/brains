import { describe, expect, test } from "bun:test";
import {
  ASK_BOX_STATE_KEY,
  askBoxAvailabilityState,
  sharedStateNamespace,
} from "@brains/contracts";
import type { DataSource } from "@brains/entity-service";
import type { PluginTestHarness } from "@brains/plugins/test";
import { openingSchema } from "../src/opening";
import { installedSite, siteSource } from "./installed-site";

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

const mapSource: DataSource & { publicId: string } = {
  id: "agent-discovery:proximity-map",
  publicId: "@brains/agent-discovery:proximity-map",
  name: "map",
  description: "the live map",
  async fetch<T>(
    _query: unknown,
    schema: { parse(value: unknown): T },
  ): Promise<T> {
    return schema.parse(map);
  },
};

/** The opening, read as a preview build reads it. */
async function opening(
  harness: PluginTestHarness,
): Promise<ReturnType<typeof openingSchema.parse>> {
  const data = await siteSource(harness, "rizom:opening").fetch?.(
    {},
    openingSchema,
    {
      publishedOnly: false,
      entityService: harness.getEntityService(),
    },
  );
  if (!data) throw new Error("The source answered nothing");
  return data;
}

describe("the opening's data", () => {
  test("is the live map with the Ask topics and the box's availability", async () => {
    const harness = installedSite([mapSource]);
    harness.addEntities([
      {
        id: "ask-content",
        entityType: "ask-content",
        content:
          "---\ntitle: What’s on your mind?\ntopics:\n  - Where would I start?\n---\n",
        metadata: {},
      },
    ]);
    // What Web Chat shares: it serves the box, on the site and its preview.
    await harness
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: sharedStateNamespace(askBoxAvailabilityState.name),
        schema: askBoxAvailabilityState.schema,
      })
      .set(ASK_BOX_STATE_KEY, { public: true, preview: true });

    const data = await opening(harness);
    expect(data.nodes.map((node) => node.id)).toEqual(["jo"]);
    expect(data.topics).toEqual(["Where would I start?"]);
    expect(data.prompt).toBe("What’s on your mind?");
    expect(data.askBox).toBe(true);
  });

  test("still opens, on an empty map and without the box, when nothing else is there", async () => {
    const data = await opening(installedSite());
    expect(data.nodes).toEqual([]);
    expect(data.topics).toEqual([]);
    expect(data.prompt).toBeNull();
    expect(data.askBox).toBe(false);
  });
});
