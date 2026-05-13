import { describe, test, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { calculatorPlugin } from "../src/core-plugin-example";
import type { PluginCapabilities } from "@brains/plugins/test";
import { DefaultContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils";

describe("ServicePlugin (formerly CorePlugin)", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

    // Register a test template that the calculator plugin expects
    harness.registerTemplate("test-template", {
      name: "test-template",
      description: "Test template",
      schema: z.object({}),
      basePrompt: "",
      formatter: new DefaultContentFormatter(),
      requiredPermission: "public",
    });

    // Install the plugin
    const plugin = calculatorPlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  test("plugin registers successfully", () => {
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toHaveLength(1);
    expect(capabilities.resources).toEqual([]);
  });

  test("provides calc_add tool", () => {
    const addTool = capabilities.tools.find((t) => t.name === "calc_add");
    expect(addTool).toBeDefined();
    expect(addTool?.description).toBe("Add two numbers");
  });

  test("handles calculation requests through messaging", async () => {
    // The plugin subscribes to calc:request in its onRegister method
    // Send a calculation request
    const response = await harness.sendMessage("calc:request", {
      operation: "add",
      a: 5,
      b: 3,
    });

    expect(response).toEqual(8);
  });

  test("handles invalid calculation requests", async () => {
    // Send an invalid request
    const response = await harness.sendMessage("calc:request", {
      operation: "unknown",
      a: 5,
      b: 3,
    });

    // The plugin should return an error
    expect(response).toBeUndefined();
  });

  test("plugin metadata is correct", () => {
    const plugin = harness.getPlugin();
    expect(plugin).toBeDefined();
    expect(plugin.id).toBe("calculator");
    expect(plugin.packageName).toBe("@brains/calculator-plugin");
    expect(plugin.type).toBe("service");
  });

  test("calculator plugin messaging works", async () => {
    // Send a calculation request
    const response = await harness.sendMessage("calc:request", {
      operation: "add",
      a: 10,
      b: 20,
    });

    expect(response).toEqual(30);
  });

  test("publishes calculation results", async () => {
    let resultReceived = false;
    let receivedResult: unknown;

    // Subscribe to calc:result messages
    const unsubscribe = harness.subscribe("calc:result", async (msg) => {
      resultReceived = true;
      receivedResult = msg.payload;
      return { success: true };
    });

    // Send a calculation request
    await harness.sendMessage("calc:request", {
      operation: "multiply",
      a: 6,
      b: 7,
    });

    // Verify the result was published
    expect(resultReceived).toBe(true);
    expect(receivedResult).toEqual({
      result: 42,
      operation: "multiply",
      operands: [6, 7],
    });

    unsubscribe();
  });
});
