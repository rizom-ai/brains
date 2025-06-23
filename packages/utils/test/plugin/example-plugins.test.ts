import { describe, it, expect } from "bun:test";
import { z } from "zod";
import type { PluginTool } from "@brains/types";
import {
  BasePlugin,
  ContentGeneratingPlugin,
  pluginConfig,
  toolInput,
  withLifecycle,
  PluginTestHarness,
} from "../..";

/**
 * Example: Simple plugin using BasePlugin
 */
class ExamplePlugin extends BasePlugin {
  constructor(config: unknown) {
    const configSchema = pluginConfig()
      .requiredString("apiKey", "API key for the service")
      .numberWithDefault("timeout", 5000, {
        min: 0,
        description: "Request timeout in milliseconds",
      })
      .build();

    super(
      "example-plugin",
      "Example Plugin",
      "A simple example plugin",
      config,
      configSchema,
    );
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const inputSchema = toolInput()
      .string("query")
      .optionalNumber("limit")
      .boolean("includeMetadata", false)
      .build();

    return [
      this.createTool(
        "search",
        "Search for items",
        inputSchema,
        async (input) => {
          const typedInput = input as {
            query: string;
            limit?: number;
            includeMetadata: boolean;
          };
          this.debug("Searching", typedInput);
          // Simulate API call with timeout
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            results: ["item1", "item2"],
            query: typedInput.query,
            limit: typedInput.limit ?? 10,
          };
        },
      ),
    ];
  }

  protected override async onShutdown(): Promise<void> {
    this.info("Shutting down");
  }
}

/**
 * Example: Content generation plugin
 */
class BlogPlugin extends ContentGeneratingPlugin {
  constructor(config: unknown) {
    const configSchema = pluginConfig()
      .requiredString("author", "Default author name")
      .build();

    super(
      "blog-plugin",
      "Blog Plugin",
      "Generate blog posts",
      config,
      configSchema,
    );

    // Register content types
    const postSchema = z.object({
      title: z.string(),
      content: z.string(),
      tags: z.array(z.string()),
      author: z.string(),
      publishedAt: z.string(),
    });

    this.registerContentType("post", {
      schema: postSchema,
      contentType: "blog-post",
      template: {
        name: "blog-post",
        description: "Blog post content",
        schema: postSchema,
        basePrompt: "Generate a blog post about the given topic",
      },
      formatter: this.createStructuredFormatter(
        (data: unknown) => {
          const typedData = data as {
            title: string;
            author: string;
            content: string;
          };
          return `# ${typedData.title}\n\nBy ${typedData.author}\n\n${typedData.content}`;
        },
        (content: string) => {
          // Simple parser for demo
          const lines = content.split("\n");
          return {
            title: lines[0]?.replace("# ", "") ?? "",
            author: lines[2]?.replace("By ", "") ?? "",
            content: lines.slice(4).join("\n"),
            tags: [],
            publishedAt: new Date().toISOString(),
          };
        },
      ),
    });
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const generateInputSchema = toolInput()
      .string("topic")
      .enum("style", ["technical", "casual", "tutorial"] as const, "casual")
      .boolean("save", true)
      .build();

    const batchInputSchema = toolInput()
      .string("category")
      .number("count")
      .boolean("save", false)
      .build();

    return [
      this.createContentGenerationTool(
        "generate_post",
        "Generate a blog post",
        generateInputSchema,
        async (input) => {
          const typedInput = input as {
            topic: string;
            style: string;
            save?: boolean;
          };
          return {
            title: `Understanding ${typedInput.topic}`,
            content: `This is a ${typedInput.style} post about ${typedInput.topic}.`,
            tags: [typedInput.topic, typedInput.style],
            author: (this.config as { author: string }).author,
            publishedAt: new Date().toISOString(),
          };
        },
        "post",
      ),
      this.createBatchGenerationTool(
        "generate_series",
        "Generate a series of blog posts",
        batchInputSchema,
        async (input) => {
          const typedInput = input as {
            category: string;
            count: number;
            save?: boolean;
          };
          const posts = [];
          for (let i = 1; i <= typedInput.count; i++) {
            posts.push({
              title: `${typedInput.category} Part ${i}`,
              content: `This is part ${i} of the ${typedInput.category} series.`,
              tags: [typedInput.category, "series"],
              author: (this.config as { author: string }).author,
              publishedAt: new Date().toISOString(),
            });
          }
          return posts;
        },
        "post",
      ),
    ];
  }
}

describe("Example Plugins", () => {
  describe("BasePlugin Example", () => {
    it("should create and use a simple plugin", async () => {
      const plugin = new ExamplePlugin({ apiKey: "test-key" });
      const harness = new PluginTestHarness();

      await harness.installPlugin(plugin);
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      expect(capabilities.tools).toHaveLength(1);
      expect(capabilities.tools[0]?.name).toBe("example-plugin:search");

      // Execute tool
      const tool = capabilities.tools[0];
      expect(tool).toBeDefined();
      const result = await tool?.handler({
        query: "test",
        includeMetadata: true,
      });
      expect(result).toHaveProperty("results");
    });

    it("should handle configuration validation", () => {
      expect(() => new ExamplePlugin({})).toThrow(/Invalid configuration/);
      expect(() => new ExamplePlugin({ apiKey: 123 })).toThrow(
        /Expected string/,
      );
    });
  });

  describe("ContentGeneratingPlugin Example", () => {
    it("should generate content", async () => {
      const plugin = new BlogPlugin({ author: "Test Author" });
      const harness = new PluginTestHarness();

      await harness.installPlugin(plugin);
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Find generate_post tool
      const generateTool = capabilities.tools.find(
        (t) => t.name === "blog-plugin:generate_post",
      );
      expect(generateTool).toBeDefined();

      // Generate content
      const result = await generateTool?.handler({
        topic: "TypeScript",
        style: "technical",
      });

      expect(result).toHaveProperty("content");
      expect((result as { content: { title: string } }).content.title).toBe(
        "Understanding TypeScript",
      );
    });

    it("should generate batch content", async () => {
      const plugin = new BlogPlugin({ author: "Test Author" });
      const harness = new PluginTestHarness();

      await harness.installPlugin(plugin);
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Find generate_series tool
      const batchTool = capabilities.tools.find(
        (t) => t.name === "blog-plugin:generate_series",
      );

      const result = await batchTool?.handler({
        category: "Testing",
        count: 3,
        save: false,
      });

      expect(result).toHaveProperty("count", 3);
      expect((result as { items: unknown[] }).items).toHaveLength(3);
    });
  });

  describe("Plugin Lifecycle", () => {
    it("should support lifecycle hooks", async () => {
      const events: string[] = [];
      const plugin = new ExamplePlugin({ apiKey: "test" });

      const wrappedPlugin = withLifecycle(plugin)
        .on("beforeRegister", () => {
          events.push("beforeRegister");
        })
        .on("afterRegister", () => {
          events.push("afterRegister");
        })
        .on("beforeShutdown", () => {
          events.push("beforeShutdown");
        })
        .on("afterShutdown", () => {
          events.push("afterShutdown");
        });

      const harness = new PluginTestHarness();
      const context = harness.getPluginContext();

      await wrappedPlugin.register(context);
      expect(events).toEqual(["beforeRegister", "afterRegister"]);

      if (wrappedPlugin.shutdown) {
        await wrappedPlugin.shutdown();
        expect(events).toEqual([
          "beforeRegister",
          "afterRegister",
          "beforeShutdown",
          "afterShutdown",
        ]);
      }
    });
  });
});
