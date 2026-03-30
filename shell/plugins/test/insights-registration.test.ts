import { describe, it, expect, beforeEach } from "bun:test";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { createBasePluginContext } from "../src/base/context";

describe("insights registration via plugin context", () => {
  let shell: MockShell;

  beforeEach(() => {
    shell = createMockShell();
  });

  it("should expose insights.register on BasePluginContext", () => {
    const context = createBasePluginContext(shell, "test-plugin");
    expect(context.insights).toBeDefined();
    expect(typeof context.insights.register).toBe("function");
  });

  it("should register an insight handler via context", () => {
    const context = createBasePluginContext(shell, "test-plugin");
    context.insights.register("custom-insight", async () => ({
      customValue: 42,
    }));

    const registry = shell.getInsightsRegistry();
    expect(registry.getTypes()).toContain("custom-insight");
  });

  it("should retrieve registered insight data", async () => {
    const context = createBasePluginContext(shell, "test-plugin");
    context.insights.register("custom-insight", async () => ({
      customValue: 42,
    }));

    const registry = shell.getInsightsRegistry();
    const result = await registry.get(
      "custom-insight",
      shell.getEntityService(),
    );
    expect(result["customValue"]).toBe(42);
  });

  it("should support multiple plugins registering different insights", () => {
    const contextA = createBasePluginContext(shell, "plugin-a");
    const contextB = createBasePluginContext(shell, "plugin-b");

    contextA.insights.register("insight-a", async () => ({ a: true }));
    contextB.insights.register("insight-b", async () => ({ b: true }));

    const registry = shell.getInsightsRegistry();
    expect(registry.getTypes()).toContain("insight-a");
    expect(registry.getTypes()).toContain("insight-b");
  });
});
