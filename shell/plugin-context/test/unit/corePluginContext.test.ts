import { describe, test, expect, beforeEach } from "bun:test";
import { createCorePluginContext } from "../../src/contexts/corePluginContext";
import { createMockCoreServices } from "../__mocks__/mockServices";
import type { CorePlugin, Command } from "../../src/types";

describe("CorePluginContext", () => {
  let mockServices: ReturnType<typeof createMockCoreServices>;
  let testPlugin: CorePlugin;

  beforeEach(() => {
    mockServices = createMockCoreServices();
    testPlugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "core",
      description: "Test plugin",
      register: async () => {},
    };
  });

  test("plugin can register and execute commands", async () => {
    const context = createCorePluginContext(testPlugin, mockServices);
    
    // Plugin registers a command
    const command: Command = {
      name: "greet",
      description: "Greet someone",
      handler: async (args) => `Hello ${args[0] || 'World'}!`,
    };
    
    context.registerCommand(command);
    
    // Verify command was registered
    expect(mockServices.commandRegistry.register).toHaveBeenCalled();
    
    // Get the registered command and test it
    const registeredCall = mockServices.commandRegistry.register.mock.calls[0];
    const registeredCommand = registeredCall[1] as Command;
    
    // Test the command handler works
    const result = await registeredCommand.handler(["Alice"]);
    expect(result).toBe("Hello Alice!");
    
    const resultNoArgs = await registeredCommand.handler([]);
    expect(resultNoArgs).toBe("Hello World!");
  });

  test("plugin can subscribe to messages", async () => {
    const context = createCorePluginContext(testPlugin, mockServices);
    
    // Plugin subscribes to events
    const handler = async (message: any) => {
      if (message.payload?.action === "ping") {
        return { success: true, response: "pong" };
      }
      return { success: false };
    };
    
    const unsubscribe = context.subscribe("game.event", handler);
    
    // Verify subscription was registered
    expect(mockServices.messageBus.subscribe).toHaveBeenCalledWith("game.event", handler);
    expect(typeof unsubscribe).toBe("function");
  });

  test("plugin can send messages", async () => {
    const context = createCorePluginContext(testPlugin, mockServices);
    
    // Plugin sends a message
    const result = await context.sendMessage("notification", { text: "Hello!" });
    
    // Verify message was sent
    expect(mockServices.messageBus.send).toHaveBeenCalledWith("notification", { text: "Hello!" });
    expect(result).toEqual({ success: true, results: [] });
  });

  test("each plugin gets isolated context", () => {
    const plugin1: CorePlugin = { ...testPlugin, id: "plugin-1" };
    const plugin2: CorePlugin = { ...testPlugin, id: "plugin-2" };
    
    const context1 = createCorePluginContext(plugin1, mockServices);
    const context2 = createCorePluginContext(plugin2, mockServices);
    
    // Each plugin has its own ID
    expect(context1.pluginId).toBe("plugin-1");
    expect(context2.pluginId).toBe("plugin-2");
    
    // Commands are registered with correct plugin IDs
    context1.registerCommand({ name: "cmd1", description: "Command 1", handler: async () => "1" });
    context2.registerCommand({ name: "cmd2", description: "Command 2", handler: async () => "2" });
    
    const calls = mockServices.commandRegistry.register.mock.calls;
    expect(calls[0][0]).toBe("plugin-1");
    expect(calls[1][0]).toBe("plugin-2");
  });
});