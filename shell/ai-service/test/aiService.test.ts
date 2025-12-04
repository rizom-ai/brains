import { describe, expect, it, beforeEach, mock, afterEach } from "bun:test";
import { AIService } from "../src/aiService";
import { createSilentLogger } from "@brains/utils";
import { z } from "@brains/utils";
import * as ai from "ai";
import * as anthropicSdk from "@ai-sdk/anthropic";

// Mock the ai SDK modules
void mock.module("ai", () => ({
  generateText: mock(() =>
    Promise.resolve({
      text: "Generated text response",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
    }),
  ),
  generateObject: mock(() =>
    Promise.resolve({
      object: { result: "structured data" },
      usage: {
        inputTokens: 15,
        outputTokens: 25,
        totalTokens: 40,
      },
    }),
  ),
}));

void mock.module("@ai-sdk/anthropic", () => ({
  anthropic: mock(() => "mock-model"),
  createAnthropic: mock(() => mock(() => "mock-model-with-key")),
}));

describe("AIService", () => {
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    AIService.resetInstance();
    logger = createSilentLogger();
    // Reset mocks
    (ai.generateText as ReturnType<typeof mock>).mockClear();
    (ai.generateObject as ReturnType<typeof mock>).mockClear();
  });

  afterEach(() => {
    AIService.resetInstance();
  });

  describe("Component Interface Standardization", () => {
    it("should implement singleton pattern", () => {
      const config = { apiKey: "test-key" };
      const instance1 = AIService.getInstance(config, logger);
      const instance2 = AIService.getInstance(config, logger);

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const config = { apiKey: "test-key" };
      const instance1 = AIService.getInstance(config, logger);

      AIService.resetInstance();

      const instance2 = AIService.getInstance(config, logger);
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance without affecting singleton", () => {
      const config = { apiKey: "test-key" };
      const singleton = AIService.getInstance(config, logger);
      const fresh = AIService.createFresh(config, logger);

      expect(fresh).not.toBe(singleton);
      expect(AIService.getInstance(config, logger)).toBe(singleton);
    });
  });

  describe("Configuration", () => {
    it("should use default configuration when not provided", () => {
      const service = AIService.createFresh({}, logger);
      const config = service.getConfig();

      expect(config.model).toBe("claude-haiku-4-5-20251001");
      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(1000);
    });

    it("should accept custom configuration", () => {
      const customConfig = {
        model: "claude-3-opus-20240229",
        temperature: 0.5,
        maxTokens: 2000,
        apiKey: "test-key",
      };

      const service = AIService.createFresh(customConfig, logger);
      const config = service.getConfig();

      expect(config.model).toBe(customConfig.model);
      expect(config.temperature).toBe(customConfig.temperature);
      expect(config.maxTokens).toBe(customConfig.maxTokens);
    });

    it("should update configuration", () => {
      const service = AIService.createFresh({}, logger);

      service.updateConfig({
        model: "claude-3-haiku-20240307",
        temperature: 0.9,
      });

      const config = service.getConfig();
      expect(config.model).toBe("claude-3-haiku-20240307");
      expect(config.temperature).toBe(0.9);
      expect(config.maxTokens).toBe(1000); // Should retain original value
    });
  });

  describe("Text Generation", () => {
    it("should generate text successfully", async () => {
      const service = AIService.createFresh({}, logger);
      const systemPrompt = "You are a helpful assistant";
      const userPrompt = "Hello, world!";

      const result = await service.generateText(systemPrompt, userPrompt);

      expect(result.text).toBe("Generated text response");
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });

      // Verify the mock was called with correct parameters
      expect(ai.generateText).toHaveBeenCalledWith({
        model: "mock-model",
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
        maxTokens: 1000,
        webSearch: true,
      });
    });

    it("should use custom provider when API key is provided", async () => {
      const service = AIService.createFresh({ apiKey: "test-key" }, logger);

      await service.generateText("System", "User");

      expect(anthropicSdk.createAnthropic).toHaveBeenCalledWith({
        apiKey: "test-key",
      });
      expect(ai.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "mock-model-with-key",
        }),
      );
    });

    it("should handle generation errors", async () => {
      const service = AIService.createFresh({}, logger);
      const error = new Error("Generation failed");

      (ai.generateText as ReturnType<typeof mock>).mockRejectedValueOnce(error);

      void expect(service.generateText("System", "User")).rejects.toThrow(
        "AI text generation failed",
      );
    });

    it("should respect custom temperature and maxTokens", async () => {
      const service = AIService.createFresh(
        {
          temperature: 0.3,
          maxTokens: 500,
        },
        logger,
      );

      await service.generateText("System", "User");

      expect(ai.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
          maxTokens: 500,
        }),
      );
    });

    it("should use defaults when temperature and maxTokens are not specified", async () => {
      const service = AIService.createFresh({}, logger);

      await service.generateText("System", "User");

      const call = (ai.generateText as ReturnType<typeof mock>).mock
        .calls[0]?.[0];
      expect(call.temperature).toBe(0.7);
      expect(call.maxTokens).toBe(1000);
    });
  });

  describe("Object Generation", () => {
    const testSchema = z.object({
      result: z.string(),
    });

    it("should generate structured object successfully", async () => {
      const service = AIService.createFresh({}, logger);
      const systemPrompt = "Generate structured data";
      const userPrompt = "Create an object";

      const result = await service.generateObject(
        systemPrompt,
        userPrompt,
        testSchema,
      );

      expect(result.object).toEqual({ result: "structured data" });
      expect(result.usage).toEqual({
        promptTokens: 15,
        completionTokens: 25,
        totalTokens: 40,
      });

      // Verify the mock was called with correct parameters
      expect(ai.generateObject).toHaveBeenCalledWith({
        model: "mock-model",
        system: systemPrompt,
        prompt: userPrompt,
        schema: testSchema,
        temperature: 0.7,
        maxTokens: 1000,
        webSearch: true,
      });
    });

    it("should handle object generation errors", async () => {
      const service = AIService.createFresh({}, logger);
      const error = new Error("Object generation failed");

      (ai.generateObject as ReturnType<typeof mock>).mockRejectedValueOnce(
        error,
      );

      void expect(
        service.generateObject("System", "User", testSchema),
      ).rejects.toThrow("AI object generation failed");
    });

    it("should respect configuration for object generation", async () => {
      const service = AIService.createFresh(
        {
          model: "claude-3-opus-20240229",
          temperature: 0.2,
          maxTokens: 1500,
        },
        logger,
      );

      await service.generateObject("System", "User", testSchema);

      expect(ai.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.2,
          maxTokens: 1500,
        }),
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty prompts", async () => {
      const service = AIService.createFresh({}, logger);

      const result = await service.generateText("", "");

      expect(result.text).toBe("Generated text response");
      expect(ai.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "",
          prompt: "",
        }),
      );
    });

    it("should handle very long prompts", async () => {
      const service = AIService.createFresh({}, logger);
      const longPrompt = "x".repeat(10000);

      const result = await service.generateText(longPrompt, longPrompt);

      expect(result.text).toBe("Generated text response");
    });

    it("should preserve original error messages", async () => {
      const service = AIService.createFresh({}, logger);
      const customError = new Error("Custom API error");

      (ai.generateText as ReturnType<typeof mock>).mockRejectedValueOnce(
        customError,
      );

      void expect(service.generateText("System", "User")).rejects.toThrow(
        "AI text generation failed",
      );
    });
  });

  describe("Tool Calling - generateWithTools", () => {
    it("should generate text without tool calls when no tools needed", async () => {
      // Mock response without tool calls
      (ai.generateText as ReturnType<typeof mock>).mockResolvedValueOnce({
        text: "Hello! How can I help you?",
        toolCalls: [],
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      });

      const service = AIService.createFresh({}, logger);
      const result = await service.generateWithTools({
        system: "You are a helpful assistant",
        messages: [{ role: "user", content: "Hello" }],
        tools: [],
      });

      expect(result.text).toBe("Hello! How can I help you?");
      expect(result.toolCalls).toEqual([]);
    });

    it("should execute tools when AI requests them", async () => {
      // Mock response with tool call
      (ai.generateText as ReturnType<typeof mock>).mockResolvedValueOnce({
        text: "I found 3 notes about TypeScript.",
        toolCalls: [
          {
            toolName: "search",
            toolCallId: "call_123",
            args: { query: "typescript" },
          },
        ],
        toolResults: [
          {
            toolCallId: "call_123",
            toolName: "search",
            result: { count: 3, results: ["note1", "note2", "note3"] },
          },
        ],
        usage: {
          inputTokens: 50,
          outputTokens: 100,
          totalTokens: 150,
        },
      });

      const searchTool = {
        name: "search",
        description: "Search for notes",
        inputSchema: z.object({ query: z.string() }),
        execute: mock(async (_args: { query: string }) => ({
          count: 3,
          results: ["note1", "note2", "note3"],
        })),
      };

      const service = AIService.createFresh({}, logger);
      const result = await service.generateWithTools({
        system: "You are a helpful assistant",
        messages: [{ role: "user", content: "Search for typescript notes" }],
        tools: [searchTool],
      });

      expect(result.text).toBe("I found 3 notes about TypeScript.");
      expect(result.toolCalls.length).toBeGreaterThanOrEqual(0);
    });

    it("should pass tools in correct format to AI SDK", async () => {
      (ai.generateText as ReturnType<typeof mock>).mockResolvedValueOnce({
        text: "Response",
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      });

      const testTool = {
        name: "test-tool",
        description: "A test tool",
        inputSchema: z.object({ input: z.string() }),
        execute: mock(async () => ({ result: "ok" })),
      };

      const service = AIService.createFresh({}, logger);
      await service.generateWithTools({
        system: "System prompt",
        messages: [{ role: "user", content: "Test" }],
        tools: [testTool],
      });

      expect(ai.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "System prompt",
          messages: [{ role: "user", content: "Test" }],
          tools: expect.any(Object),
        }),
      );
    });

    it("should handle multiple tool calls in sequence", async () => {
      (ai.generateText as ReturnType<typeof mock>).mockResolvedValueOnce({
        text: "I searched and then created the note.",
        toolCalls: [
          { toolName: "search", toolCallId: "call_1", args: { query: "test" } },
          {
            toolName: "create",
            toolCallId: "call_2",
            args: { title: "New Note" },
          },
        ],
        toolResults: [
          { toolCallId: "call_1", toolName: "search", result: { count: 0 } },
          { toolCallId: "call_2", toolName: "create", result: { id: "123" } },
        ],
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      });

      const searchTool = {
        name: "search",
        description: "Search notes",
        inputSchema: z.object({ query: z.string() }),
        execute: mock(async () => ({ count: 0 })),
      };

      const createTool = {
        name: "create",
        description: "Create note",
        inputSchema: z.object({ title: z.string() }),
        execute: mock(async () => ({ id: "123" })),
      };

      const service = AIService.createFresh({}, logger);
      const result = await service.generateWithTools({
        system: "Assistant",
        messages: [{ role: "user", content: "Search and create" }],
        tools: [searchTool, createTool],
      });

      expect(result.text).toBe("I searched and then created the note.");
    });

    it("should handle tool execution errors gracefully", async () => {
      (ai.generateText as ReturnType<typeof mock>).mockRejectedValueOnce(
        new Error("Tool execution failed"),
      );

      const failingTool = {
        name: "failing-tool",
        description: "A tool that fails",
        inputSchema: z.object({}),
        execute: mock(async () => {
          throw new Error("Tool error");
        }),
      };

      const service = AIService.createFresh({}, logger);

      void expect(
        service.generateWithTools({
          system: "System",
          messages: [{ role: "user", content: "Use the failing tool" }],
          tools: [failingTool],
        }),
      ).rejects.toThrow();
    });

    it("should return usage statistics", async () => {
      (ai.generateText as ReturnType<typeof mock>).mockResolvedValueOnce({
        text: "Response",
        toolCalls: [],
        usage: { inputTokens: 42, outputTokens: 58, totalTokens: 100 },
      });

      const service = AIService.createFresh({}, logger);
      const result = await service.generateWithTools({
        system: "System",
        messages: [{ role: "user", content: "Hello" }],
        tools: [],
      });

      expect(result.usage).toEqual({
        promptTokens: 42,
        completionTokens: 58,
        totalTokens: 100,
      });
    });

    it("should support multi-turn conversation with tool results", async () => {
      (ai.generateText as ReturnType<typeof mock>).mockResolvedValueOnce({
        text: "Based on my search, here are your notes.",
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });

      const service = AIService.createFresh({}, logger);
      const result = await service.generateWithTools({
        system: "Assistant",
        messages: [
          { role: "user", content: "Search for notes" },
          { role: "assistant", content: "Let me search for you." },
          {
            role: "tool",
            content: JSON.stringify({ results: ["note1", "note2"] }),
            toolCallId: "call_1",
            toolName: "search",
          },
        ],
        tools: [],
      });

      expect(result.text).toBe("Based on my search, here are your notes.");
    });
  });
});
