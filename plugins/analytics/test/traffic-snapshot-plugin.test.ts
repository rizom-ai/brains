import { describe, expect, it } from "bun:test";
import { EntityRegistry } from "@brains/entity-service";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { TrafficSnapshotPlugin } from "../src/entity/plugin";
import { trafficSnapshotAdapter } from "../src/entity/adapter";
import { trafficSnapshotSchema } from "../src/entity/schema";

describe("TrafficSnapshotPlugin", () => {
  it("registers a restricted, non-indexed, non-projection entity", async () => {
    const harness = createPluginHarness();
    const registry = harness.getEntityRegistry();
    type Validator = Parameters<typeof registry.registerPersistValidator>[1];
    let validator: Validator | undefined;
    registry.registerPersistValidator = (type, candidate): void => {
      if (type === "traffic-snapshot") validator = candidate;
    };

    const capabilities = await harness.installPlugin(
      new TrafficSnapshotPlugin(),
    );

    expect(registry.getEntityTypeConfig("traffic-snapshot")).toMatchObject({
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
      // A snapshot's days fix its week; the stored copies are retired.
      retiredFields: ["week", "start", "end"],
    });
    expect(capabilities.tools).toEqual([]);
    // A brain's registry refuses to retire a field the metadata still needs.
    expect(() =>
      EntityRegistry.createFresh(createSilentLogger()).registerEntityType(
        "traffic-snapshot",
        trafficSnapshotSchema,
        trafficSnapshotAdapter,
        registry.getEntityTypeConfig("traffic-snapshot"),
      ),
    ).not.toThrow();

    // A snapshot is the capture's record of what Cloudflare counted: it sits
    // with the system's records, and no one creates, edits or deletes it.
    expect(registry.getEntityTypeConfig("traffic-snapshot")).toMatchObject({
      classification: "system",
      actionPolicy: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
    });
    if (!validator) throw new Error("Missing persist validator");

    const entity = {
      id: "2026-W41",
      entityType: "traffic-snapshot",
      visibility: "restricted" as const,
      content: trafficSnapshotAdapter.createContent({
        days: [
          {
            date: "2026-10-05",
            pageviews: 1,
            visits: 1,
            estimated: false,
            paths: [],
            referrers: [],
            pathReferrers: [],
            countries: [],
          },
        ],
      }),
      metadata: {},
      contentHash: "hash",
      created: "2026-10-09T00:00:00.000Z",
      updated: "2026-10-09T00:00:00.000Z",
    };
    expect(await validator(entity, { operation: "create" })).toBeUndefined();
    expect(
      validator({ ...entity, visibility: "public" }, { operation: "create" }),
    ).rejects.toThrow("Traffic snapshots must have restricted visibility");
    expect(
      validator(
        { ...entity, content: "no frontmatter" },
        { operation: "update" },
      ),
    ).rejects.toThrow();
  });
});
