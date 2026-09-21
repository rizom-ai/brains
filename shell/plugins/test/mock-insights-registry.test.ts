import { describe, expect, it } from "bun:test";
import { createMockInsightsRegistry } from "../src/test/mock-insights-registry";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";
import type { InsightHandler } from "../src/index";

const entityService = createMockEntityService(createMockEntityStore());

describe("createMockInsightsRegistry", () => {
  it("calls the handler registered for a type", async () => {
    const registry = createMockInsightsRegistry();
    const handler: InsightHandler = async () => ({ notes: 3 });
    registry.register("notes", handler);

    expect(await registry.get("notes", entityService, "public")).toEqual({
      notes: 3,
    });
    expect(registry.getTypes()).toEqual(["notes"]);
  });

  it("passes the entity service and scope straight through", async () => {
    const registry = createMockInsightsRegistry();
    const seen: unknown[] = [];
    registry.register("notes", async (service, scope) => {
      seen.push(service, scope);
      return {};
    });

    await registry.get("notes", entityService, "restricted");

    expect(seen[0]).toBe(entityService);
    expect(seen[1]).toBe("restricted");
  });

  it("names the types it does have when asked for one it does not", async () => {
    // The available list is the whole value of the error: an insight type
    // missing because a plugin never registered looks identical to a typo.
    const registry = createMockInsightsRegistry();
    registry.register("notes", async () => ({}));
    registry.register("links", async () => ({}));

    expect(registry.get("absent", entityService, "public")).rejects.toThrow(
      /Unknown insight type: absent\. Available: notes, links/,
    );
  });

  it("replaces a handler registered twice for one type", async () => {
    const registry = createMockInsightsRegistry();
    registry.register("notes", async () => ({ which: "first" }));
    registry.register("notes", async () => ({ which: "second" }));

    expect(await registry.get("notes", entityService, "public")).toEqual({
      which: "second",
    });
    expect(registry.getTypes()).toEqual(["notes"]);
  });

  it("forgets a type it unregisters", async () => {
    const registry = createMockInsightsRegistry();
    registry.register("notes", async () => ({}));

    registry.unregister("notes");

    expect(registry.getTypes()).toEqual([]);
    expect(registry.get("notes", entityService, "public")).rejects.toThrow(
      /Unknown insight type/,
    );
  });
});
