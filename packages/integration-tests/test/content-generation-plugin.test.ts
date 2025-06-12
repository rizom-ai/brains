import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  PluginTestHarness,
  ContentGeneratingPlugin,
  validatePluginConfig,
  pluginConfig,
} from "@brains/utils";
import type { PluginContext, PluginTool } from "@brains/types";
import { z } from "zod";

// Test content schemas
const testContentSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const testSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
});

// Test plugin that uses ContentGeneratingPlugin
class TestContentPlugin extends ContentGeneratingPlugin<{ debug: boolean }> {
  constructor(config: unknown) {
    const validatedConfig = validatePluginConfig(
      pluginConfig().build(),
      config,
      "test-content",
    );

    super(
      "test-content",
      "Test Content Plugin",
      "Plugin for testing content generation",
      validatedConfig,
    );
  }

  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // Register content types with different naming patterns
    this.registerContentType("simple", {
      contentType: "simple",
      schema: testContentSchema,
    });

    this.registerContentType("section:test", {
      contentType: "section:test",
      schema: testSectionSchema,
    });
  }

  protected override async getTools(): Promise<PluginTool[]> {
    // Get auto-generated tools from parent
    const contentTools = await super.getTools();

    // Add a custom tool that uses generateContent
    const customTool = this.createTool(
      "generate_custom",
      "Generate custom content using context generateContent",
      { type: z.enum(["simple", "section"]) },
      async (input) => {
        const { type } = input as { type: "simple" | "section" };

        // Use the generateContent from context (which goes through pluginManager)
        const contentType = type === "simple" ? "simple" : "section:test";
        const pluginContext = this.getContext();
        const result =
          type === "simple"
            ? await pluginContext.generateContent({
                contentType,
                schema: testContentSchema,
                prompt: `Generate test simple content`,
              })
            : await pluginContext.generateContent({
                contentType,
                schema: testSectionSchema,
                prompt: `Generate test section content`,
              });

        return { generated: result };
      },
    );

    return [...contentTools, customTool];
  }
}

describe("ContentGeneratingPlugin Integration", () => {
  let harness: PluginTestHarness;

  beforeEach(() => {
    harness = new PluginTestHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("should handle content generation without double prefixing", async () => {
    const plugin = new TestContentPlugin({});
    await harness.installPlugin(plugin);

    // Get the custom tool that uses context.generateContent
    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);
    const customTool = capabilities.tools.find(
      (t) => t.name === "test-content:generate_custom",
    );

    expect(customTool).toBeDefined();

    // The key test: when calling generateContent with "section:test" (which contains a colon),
    // it should not double-prefix and cause "No schema registered" error
    try {
      if (!customTool) {
        throw new Error("Custom tool not found");
      }
      const result = await customTool.handler({ type: "section" });
      expect(result).toHaveProperty("generated");
      // If we get here, the fix is working - no double prefixing occurred
    } catch (error) {
      // If it fails with "No schema registered", that's the bug we fixed
      if (
        error instanceof Error &&
        error.message.includes("No schema registered")
      ) {
        throw new Error(
          "Content type registration failed - double prefixing bug detected",
        );
      }
      throw error;
    }
  });
});
