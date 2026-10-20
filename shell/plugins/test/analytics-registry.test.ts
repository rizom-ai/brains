import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { AnalyticsRegistry, defineAnalyticsReport } from "../src";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";

const entityService = createMockEntityService(createMockEntityStore());

const notes = defineAnalyticsReport({
  type: "notes",
  description: "Counts notes.",
  params: z.object({ limit: z.number().int().min(1).default(10) }),
  handler: async ({ limit }, { visibilityScope }) => ({
    limit,
    visibilityScope,
  }),
});

describe("AnalyticsRegistry", () => {
  it("runs a report with its params parsed, defaults filled", async () => {
    const registry = new AnalyticsRegistry();
    registry.register(notes);

    expect(
      await registry.run({
        type: "notes",
        params: { limit: 3 },
        entityService,
        permission: "admin",
      }),
    ).toEqual({ limit: 3, visibilityScope: "restricted" });
    expect(
      await registry.run({
        type: "notes",
        entityService,
        permission: "public",
      }),
    ).toEqual({ limit: 10, visibilityScope: "public" });
  });

  it("refuses params the report does not accept, naming the report", async () => {
    const registry = new AnalyticsRegistry();
    registry.register(notes);

    expect(
      registry.run({
        type: "notes",
        params: { limit: 0 },
        entityService,
        permission: "admin",
      }),
    ).rejects.toThrow(/notes.*limit/s);
  });

  it("keeps a report from callers below its floor", async () => {
    const registry = new AnalyticsRegistry();
    registry.register({ ...notes, type: "owner-only", minVisibility: "admin" });

    expect(
      registry.run({
        type: "owner-only",
        entityService,
        permission: "trusted",
      }),
    ).rejects.toThrow(/owner-only/);
    expect(
      await registry.run({
        type: "owner-only",
        entityService,
        permission: "admin",
      }),
    ).toEqual({ limit: 10, visibilityScope: "restricted" });
  });

  it("names the reports it has when asked for one it does not", async () => {
    // A report missing because a plugin never registered it looks identical
    // to a typo; the available list tells them apart.
    const registry = new AnalyticsRegistry();
    registry.register(notes);
    registry.register({ ...notes, type: "links" });

    expect(
      registry.run({ type: "absent", entityService, permission: "admin" }),
    ).rejects.toThrow(
      /Unknown analytics report: absent\. Available: notes, links/,
    );
  });

  it("replaces a report registered twice and forgets one unregistered", () => {
    const registry = new AnalyticsRegistry();
    registry.register(notes);
    registry.register({ ...notes, description: "Second." });
    expect(registry.getDefinitions().map((d) => d.description)).toEqual([
      "Second.",
    ]);

    registry.unregister("notes");
    expect(registry.getDefinitions()).toEqual([]);
  });
});
