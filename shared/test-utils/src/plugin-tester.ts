import type {
  Plugin,
  PluginTool,
  PluginCapabilities,
} from "@brains/plugin-utils";
import { PluginTestHarness } from "./harness";
import { expect } from "bun:test";

/**
 * Common plugin test scenarios
 */
export class PluginTester {
  private harness: PluginTestHarness;
  private plugin: Plugin;
  private capabilities?: PluginCapabilities;

  constructor(plugin: Plugin, harness?: PluginTestHarness) {
    this.plugin = plugin;
    this.harness = harness ?? new PluginTestHarness();
  }

  /**
   * Test basic plugin registration
   */
  async testRegistration(): Promise<void> {
    await this.harness.installPlugin(this.plugin);

    // Check plugin is installed
    const installedPlugins = this.harness.getInstalledPlugins();
    expect(installedPlugins).toContain(this.plugin);

    // Get capabilities
    const context = this.harness.getPluginContext();
    this.capabilities = await this.plugin.register(context);

    // Basic validation
    expect(this.capabilities).toBeDefined();
    expect(this.capabilities.tools).toBeInstanceOf(Array);
    expect(this.capabilities.resources).toBeInstanceOf(Array);
  }

  /**
   * Test that all tools have required properties
   */
  async testToolsStructure(): Promise<void> {
    if (!this.capabilities) {
      await this.testRegistration();
    }

    if (!this.capabilities) {
      throw new Error("Plugin not registered yet");
    }

    for (const tool of this.capabilities.tools) {
      expect(tool.name).toBeString();
      expect(tool.description).toBeString();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeFunction();
    }
  }

  /**
   * Test tool execution with valid input
   */
  async testToolExecution(
    toolName: string,
    input: unknown = {},
  ): Promise<unknown> {
    if (!this.capabilities) {
      await this.testRegistration();
    }

    const tool = this.findTool(toolName);
    const result = await tool.handler(input);

    // Basic validation - result should not throw
    expect(result).toBeDefined();

    return result;
  }

  /**
   * Test tool with invalid input
   */
  async testToolValidation(
    toolName: string,
    invalidInput: unknown,
  ): Promise<void> {
    if (!this.capabilities) {
      await this.testRegistration();
    }

    const tool = this.findTool(toolName);

    // Should throw validation error
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(tool.handler(invalidInput)).rejects.toThrow();
  }

  /**
   * Test plugin cleanup/shutdown
   */
  async testShutdown(): Promise<void> {
    if (!this.capabilities) {
      await this.testRegistration();
    }

    // If plugin has shutdown method, test it
    if (
      "shutdown" in this.plugin &&
      typeof this.plugin.shutdown === "function"
    ) {
      // Just call shutdown and ensure it doesn't throw
      await this.plugin.shutdown();
    }
  }

  /**
   * Get the test harness
   */
  getHarness(): PluginTestHarness {
    return this.harness;
  }

  /**
   * Get registered capabilities
   */
  getCapabilities(): PluginCapabilities | undefined {
    return this.capabilities;
  }

  /**
   * Find a tool by name
   */
  findTool(name: string): PluginTool {
    if (!this.capabilities) {
      throw new Error("Plugin not registered yet");
    }

    const tool = this.capabilities.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }

    return tool;
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    if (!this.capabilities) {
      throw new Error("Plugin not registered yet");
    }

    return this.capabilities.tools.map((t) => t.name);
  }

  /**
   * Cleanup test resources
   */
  async cleanup(): Promise<void> {
    await this.harness.cleanup();
  }
}
