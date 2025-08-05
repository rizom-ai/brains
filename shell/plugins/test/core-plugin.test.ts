import { describe, test, expect, beforeEach } from "bun:test";
import { createCorePluginHarness } from "../src/test/harness";
import { calculatorPlugin } from "../src/core/example";
import type { PluginCapabilities } from "../src/interfaces";
import { DefaultContentFormatter } from "@brains/utils";
import { z } from "zod";

describe("CorePlugin", () => {
  let harness: ReturnType<typeof createCorePluginHarness>;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createCorePluginHarness();

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
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.commands).toHaveLength(4); // Updated for calc:stats and calc:history
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

  test("provides calc:add command", async () => {
    // Find the calc:add command
    const addCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:add",
    );
    expect(addCommand).toBeDefined();
    expect(addCommand?.description).toBe("Add two numbers");

    // Test the command
    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor" as const,
    };

    expect(addCommand).toBeDefined();
    if (!addCommand) return;

    const result = await addCommand.handler(["10", "5"], mockContext);
    expect(result).toEqual({
      type: "message",
      message: "10 + 5 = 15",
    });

    // Test with invalid input
    const errorResult = await addCommand.handler(["abc", "5"], mockContext);
    expect(errorResult).toEqual({
      type: "message",
      message: "Error: Please provide two valid numbers",
    });
  });

  test("provides calc:format command", async () => {
    // Find the calc:format command
    const formatCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:format",
    );
    expect(formatCommand).toBeDefined();
    expect(formatCommand?.description).toBe("Format a calculation result");

    // The plugin should have registered its templates during onRegister
    // Test the format command
    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor" as const,
    };

    expect(formatCommand).toBeDefined();
    if (!formatCommand) return;

    const result = await formatCommand.handler(["42"], mockContext);
    expect(result.type).toBe("message");
    // Just verify formatting happened, don't test exact output
    expect(result.message).toBeDefined();
    expect(result.message).toContain("42");
  });

  test("plugin metadata is correct", () => {
    const plugin = harness.getPlugin();
    expect(plugin).toBeDefined();
    expect(plugin.id).toBe("calculator");
    expect(plugin.packageName).toBe("@brains/calculator-plugin");
    expect(plugin.type).toBe("core");
  });

  test("calculator plugin commands work correctly", async () => {
    const addCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:add",
    );
    expect(addCommand).toBeDefined();

    // Test valid addition
    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor" as const,
    };

    expect(addCommand).toBeDefined();
    if (!addCommand) return;

    const result = await addCommand.handler(["5", "3"], mockContext);
    expect(result).toEqual({
      type: "message",
      message: "5 + 3 = 8",
    });

    // Test invalid input
    const errorResult = await addCommand.handler(
      ["not", "numbers"],
      mockContext,
    );
    expect(errorResult).toEqual({
      type: "message",
      message: "Error: Please provide two valid numbers",
    });
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

  test("handles permission-based commands", async () => {
    const statsCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:stats",
    );
    expect(statsCommand).toBeDefined();

    // Test with public permission
    const publicContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "public" as const,
    };

    expect(statsCommand).toBeDefined();
    if (!statsCommand) return;

    const publicResult = await statsCommand.handler([], publicContext);
    expect(publicResult).toEqual({
      type: "message",
      message: "Statistics are only available for trusted users",
    });

    // Test with trusted permission
    const trustedContext = {
      ...publicContext,
      userPermissionLevel: "trusted" as const,
    };

    const trustedResult = await statsCommand.handler([], trustedContext);
    expect(trustedResult.type).toBe("message");
    expect(trustedResult.message).toContain("Calculator Statistics");
    expect(trustedResult.message).toContain("User level: trusted");
  });

  test("demonstrates entity service access", async () => {
    const historyCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:history",
    );
    expect(historyCommand).toBeDefined();

    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "trusted" as const,
    };

    expect(historyCommand).toBeDefined();
    if (!historyCommand) return;

    // Test with no history
    const result = await historyCommand.handler([], mockContext);
    expect(result.type).toBe("message");
    // Should show no history message since mock entity service returns empty array
    expect(result.message).toContain("No calculation history found");

    // Test with limit argument
    const limitResult = await historyCommand.handler(["10"], mockContext);
    expect(limitResult.type).toBe("message");
  });
});
