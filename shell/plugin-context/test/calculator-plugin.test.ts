import { describe, test, expect, beforeEach } from "bun:test";
import { createCorePluginContext } from "../src/contexts/corePluginContext";
import { createMockCoreServices } from "./__mocks__/mockServices";
import { calculatorPlugin } from "../examples/calculator-plugin";

describe("Calculator Plugin - CorePluginContext Integration", () => {
  let mockServices: ReturnType<typeof createMockCoreServices>;
  let context: ReturnType<typeof createCorePluginContext>;

  beforeEach(() => {
    mockServices = createMockCoreServices();
    context = createCorePluginContext(calculatorPlugin, mockServices);
  });

  test("plugin returns capabilities with commands (standard pattern)", async () => {
    const capabilities = await calculatorPlugin.register(context);

    // Verify the structure matches PluginCapabilities
    expect(capabilities).toHaveProperty("tools");
    expect(capabilities).toHaveProperty("resources");
    expect(capabilities).toHaveProperty("commands");

    // Verify commands are returned
    expect(capabilities.commands).toHaveLength(2);

    const addCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:add",
    );
    const formatCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:format",
    );

    expect(addCommand).toBeDefined();
    expect(formatCommand).toBeDefined();

    // Test command execution
    const addResult = await addCommand!.handler(["5", "3"]);
    expect(addResult).toBe("5 + 3 = 8");

    const errorResult = await addCommand!.handler(["abc", "3"]);
    expect(errorResult).toBe("Error: Please provide two valid numbers");
  });

  test("plugin registers templates during initialization", async () => {
    await calculatorPlugin.register(context);

    // Verify templates were registered
    const templateCalls =
      mockServices.contentGenerator.registerTemplate.mock.calls;
    expect(templateCalls).toHaveLength(2);

    const templateNames = templateCalls.map((call) => call[0]);
    expect(templateNames).toContain("calculation-result");
    expect(templateNames).toContain("math-explanation");
  });

  test("plugin uses formatContent in commands", async () => {
    const capabilities = await calculatorPlugin.register(context);

    const formatCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:format",
    );
    await formatCommand!.handler(["42"]);

    // Verify formatContent was called
    expect(mockServices.contentGenerator.formatContent).toHaveBeenCalledWith(
      "calculation-result",
      expect.objectContaining({ result: "42" }),
      expect.objectContaining({ pluginId: "calculator" }),
    );
  });

  test("plugin sets up messaging subscriptions", async () => {
    await calculatorPlugin.register(context);

    // Verify message subscription
    const subscribeCalls = mockServices.messageBus.subscribe.mock.calls;
    expect(subscribeCalls).toHaveLength(1);
    expect(subscribeCalls[0][0]).toBe("calc:request");

    const messageHandler = subscribeCalls[0][1];

    // Test message handling
    const testMessage = {
      id: "test-123",
      payload: { operation: "add", a: 10, b: 5 },
    };

    const result = await messageHandler(testMessage);
    expect(result).toEqual({ success: true });

    // Verify sendMessage was called with result
    expect(mockServices.messageBus.send).toHaveBeenCalledWith(
      "calc:result",
      expect.objectContaining({
        requestId: "test-123",
        result: 15,
        operation: "add",
        operands: [10, 5],
      }),
      "calculator",
    );
  });

  test("plugin attempts content generation during registration", async () => {
    await calculatorPlugin.register(context);

    // Verify generateContent was called
    expect(mockServices.contentGenerator.generateContent).toHaveBeenCalledWith(
      "math-explanation",
      expect.objectContaining({
        operation: "addition",
        operands: ["numbers", "values"],
      }),
      "calculator",
    );
  });

  test("plugin provides proper logging context", async () => {
    const capabilities = await calculatorPlugin.register(context);

    // Test that logger is scoped to plugin
    expect(context.pluginId).toBe("calculator");
    expect(context.logger).toBeDefined();

    // Execute a command to trigger logging
    const addCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:add",
    );
    await addCommand!.handler(["2", "3"]);

    // Verify logger is functional (we can't easily test mock logger calls)
    expect(typeof context.logger.info).toBe("function");
  });

  test("plugin follows PluginCapabilities structure", async () => {
    const capabilities = await calculatorPlugin.register(context);

    // Verify exact structure matches application system
    expect(capabilities).toEqual({
      tools: expect.any(Array),
      resources: expect.any(Array),
      commands: expect.any(Array),
    });

    // Core plugins typically have empty tools/resources arrays
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);

    // But should have commands
    expect(capabilities.commands.length).toBeGreaterThan(0);
  });
});
