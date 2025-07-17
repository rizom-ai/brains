import { describe, test, expect, beforeEach } from "bun:test";
import { createCorePluginContext } from "../../src/contexts/corePluginContext";
import { createMockCoreServices } from "../__mocks__/mockServices";
import { calculatorPlugin } from "../../examples/calculator-plugin";

describe("Calculator Plugin Integration", () => {
  let mockServices: ReturnType<typeof createMockCoreServices>;

  beforeEach(() => {
    mockServices = createMockCoreServices();
  });

  test("calculator plugin registers expected commands", async () => {
    const context = createCorePluginContext(calculatorPlugin, mockServices);
    
    await calculatorPlugin.register(context);
    
    // Check that commands were registered
    const calls = mockServices.commandRegistry.register.mock.calls;
    expect(calls).toHaveLength(2);
    
    // Verify command names
    const commandNames = calls.map(call => call[1].name);
    expect(commandNames).toContain("calc:add");
    expect(commandNames).toContain("calc:multiply");
  });

  test("calculator commands work correctly", async () => {
    const context = createCorePluginContext(calculatorPlugin, mockServices);
    
    await calculatorPlugin.register(context);
    
    // Get the registered commands
    const calls = mockServices.commandRegistry.register.mock.calls;
    const addCommand = calls.find(call => call[1].name === "calc:add")[1];
    const multiplyCommand = calls.find(call => call[1].name === "calc:multiply")[1];
    
    // Test add command
    const addResult = await addCommand.handler(["5", "3"]);
    expect(addResult).toBe("5 + 3 = 8");
    
    // Test multiply command
    const multiplyResult = await multiplyCommand.handler(["4", "7"]);
    expect(multiplyResult).toBe("4 × 7 = 28");
    
    // Test error handling
    const errorResult = await addCommand.handler(["abc", "3"]);
    expect(errorResult).toBe("Error: Please provide two valid numbers");
  });

  test("calculator plugin registers MCP tool", async () => {
    const context = createCorePluginContext(calculatorPlugin, mockServices);
    
    await calculatorPlugin.register(context);
    
    // Check that tool was registered
    const calls = mockServices.toolRegistry.register.mock.calls;
    expect(calls).toHaveLength(1);
    
    const tool = calls[0][1];
    expect(tool.name).toBe("calculate");
    
    // Test the tool handler
    const result = await tool.handler({ operation: "divide", a: 10, b: 2 });
    expect(result).toEqual({
      result: 5,
      expression: "10 ÷ 2 = 5",
    });
    
    // Test division by zero
    await expect(
      tool.handler({ operation: "divide", a: 10, b: 0 })
    ).rejects.toThrow("Division by zero");
  });

  test("calculator plugin subscribes to messages", async () => {
    const context = createCorePluginContext(calculatorPlugin, mockServices);
    
    await calculatorPlugin.register(context);
    
    // Check that subscription was created
    const calls = mockServices.messageBus.subscribe.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("calc:request");
  });
});