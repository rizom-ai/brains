import { describe, expect, it } from "bun:test";
import { InboxRegistry, type InboxItem } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  InboxDataSource,
  UnifiedInboxPlugin,
  inboxProjectionSchema,
} from "../src";

function item(
  id: string,
  urgency: "high" | "normal",
  receivedAt: string,
): InboxItem {
  return {
    id,
    title: `Attention ${id}`,
    receivedAt,
    urgency,
    actions: [{ id: "dismiss", label: "Dismiss" }],
  };
}

describe("InboxDataSource", () => {
  it("aggregates all sources by urgency then recency", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("alpha-plugin", {
      sourceId: "alpha",
      displayName: "Alpha",
      list: async () => [
        item("alpha-normal", "normal", "2026-08-04T12:00:00.000Z"),
        item("alpha-high", "high", "2026-08-04T08:00:00.000Z"),
      ],
      act: async () => undefined,
    });
    registry.registerSource("beta-plugin", {
      sourceId: "beta",
      displayName: "Beta",
      list: async () => [item("beta-high", "high", "2026-08-04T10:00:00.000Z")],
      act: async () => undefined,
    });
    registry.finalize();

    const projection = inboxProjectionSchema.parse(
      await new InboxDataSource(registry).getInboxData(),
    );

    expect(projection.entries.map((entry) => entry.item.id)).toEqual([
      "beta-high",
      "alpha-high",
      "alpha-normal",
    ]);
    expect(projection.entries.map((entry) => entry.source.sourceId)).toEqual([
      "beta",
      "alpha",
      "alpha",
    ]);
    expect(projection.errors).toEqual([]);
  });

  it("isolates a failing source without exposing its exception", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("healthy-plugin", {
      sourceId: "healthy",
      displayName: "Healthy",
      list: async () => [
        item("healthy-1", "normal", "2026-08-04T09:00:00.000Z"),
      ],
      act: async () => undefined,
    });
    registry.registerSource("failing-plugin", {
      sourceId: "failing",
      displayName: "Failing",
      list: async () => {
        throw new Error("private source failure");
      },
      act: async () => undefined,
    });
    registry.finalize();

    const projection = await new InboxDataSource(registry).getInboxData();

    expect(projection.entries.map((entry) => entry.item.id)).toEqual([
      "healthy-1",
    ]);
    expect(projection.errors).toEqual([
      {
        source: { sourceId: "failing", displayName: "Failing" },
        error: "Source unavailable",
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain("private source failure");
  });

  it("returns a stable empty projection", async () => {
    const registry = new InboxRegistry();
    registry.finalize();

    expect(await new InboxDataSource(registry).getInboxData()).toEqual({
      entries: [],
      errors: [],
    });
  });

  it("registers the aggregation datasource from the opt-in plugin", async () => {
    const harness = createPluginHarness<UnifiedInboxPlugin>({
      logContext: "unified-inbox-test",
    });
    await harness.installPlugin(new UnifiedInboxPlugin());

    expect(
      harness.getMockShell().getDataSourceRegistry().has("unified-inbox:inbox"),
    ).toBe(true);
  });
});
