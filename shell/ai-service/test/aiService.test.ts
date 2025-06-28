import { describe, expect, it, beforeEach, mock, afterEach } from "bun:test";
import { AIService } from "../src/aiService";
import { createSilentLogger } from "@brains/utils";
import { z } from "zod";
import * as ai from "ai";
import * as anthropicSdk from "@ai-sdk/anthropic";

// Mock the ai SDK modules
void mock.module("ai", () => ({
  generateText: mock(() =>
    Promise.resolve({
      text: "Generated text response",
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    }),
  ),
  generateObject: mock(() =>
    Promise.resolve({
      object: { result: "structured data" },
      usage: {
        promptTokens: 15,
        completionTokens: 25,
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

      expect(config.model).toBe("claude-4-sonnet-20250514");
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
});
