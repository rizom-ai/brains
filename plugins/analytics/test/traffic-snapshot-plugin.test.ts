import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { TrafficSnapshotPlugin } from "../src/entity/plugin";
import { trafficSnapshotAdapter } from "../src/entity/adapter";

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
    });
    expect(capabilities.tools).toEqual([]);
    if (!validator) throw new Error("Missing persist validator");

    const entity = {
      id: "2026-W41",
      entityType: "traffic-snapshot",
      visibility: "restricted" as const,
      content: trafficSnapshotAdapter.createContent({
        week: "2026-W41",
        start: "2026-10-05",
        end: "2026-10-11",
        days: [],
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
