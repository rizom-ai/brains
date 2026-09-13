import { describe, it, expect } from "bun:test";
import { createMockServicePluginContext } from "../src/test/mock-service-plugin-context";

describe("createMockServicePluginContext", () => {
  it("should create a mock context with entity service", () => {
    const context = createMockServicePluginContext();
    expect(context.entityService).toBeDefined();
    expect(context.logger).toBeDefined();
    expect(context.pluginId).toBe("test-plugin");
  });

  it("should accept custom options", () => {
    const context = createMockServicePluginContext({
      pluginId: "my-plugin",
      entityTypes: ["note"],
    });
    expect(context.pluginId).toBe("my-plugin");
    expect(context.entityService.getEntityTypes()).toEqual(["note"]);
  });
});
