import {
  describe,
  expect,
  it,
  beforeEach,
  mock,
  afterEach,
  spyOn,
  type Mock,
} from "bun:test";
import { AIService } from "../src/aiService";
import { createSilentLogger, createTestLogger } from "@brains/test-utils";
import { z, LogLevel } from "@brains/utils";
import * as ai from "ai";
import * as anthropicSdk from "@ai-sdk/anthropic";

// Valid 1x1 PNG image as base64
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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
  generateImage: mock(() =>
    Promise.resolve({
      image: { base64: VALID_PNG_BASE64 },
    }),
  ),
}));

void mock.module("@ai-sdk/anthropic", () => ({
  anthropic: mock(() => "mock-model"),
  createAnthropic: mock(() => mock(() => "mock-model-with-key")),
}));

const mockOpenAIImage = mock(() => "mock-openai-image-model");
void mock.module("@ai-sdk/openai", () => ({
  createOpenAI: mock(() => ({
    image: mockOpenAIImage,
  })),
}));

const mockGoogleImage = mock(() => "mock-google-image-model");
void mock.module("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mock(() => ({
    image: mockGoogleImage,
  })),
}));

describe("AIService", () => {
  let logger: ReturnType<typeof createSilentLogger>;
  let generateTextSpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let generateObjectSpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let generateImageSpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  beforeEach(() => {
    AIService.resetInstance();
    logger = createSilentLogger();

    // Set up spies
    generateTextSpy = spyOn(
      ai,
      "generateText",
    ) as unknown as typeof generateTextSpy;
    generateObjectSpy = spyOn(
      ai,
      "generateObject",
    ) as unknown as typeof generateObjectSpy;
    generateImageSpy = spyOn(
      ai,
      "generateImage",
    ) as unknown as typeof generateImageSpy;

    // Reset mocks
    generateTextSpy.mockClear();
    generateObjectSpy.mockClear();
    generateImageSpy.mockClear();
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

      expect(config.model).toBe("gpt-4.1");
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

    it("should emit ai:usage log entry with token counts", async () => {
      const testLogger = createTestLogger(LogLevel.INFO);
      // Spy on child so child logger calls inherit the spy
      const childLogger = testLogger.child("AIService");
      const childSpy = spyOn(childLogger, "info");
      const childMock = spyOn(testLogger, "child").mockReturnValue(childLogger);

      const service = AIService.createFresh({}, testLogger);
      await service.generateText("System", "User");

      const usageCall = childSpy.mock.calls.find(
        (call) => call[0] === "ai:usage",
      );
      expect(usageCall).toBeDefined();
      expect(usageCall?.[1]).toMatchObject({
        operation: "text_generation",
        inputTokens: 10,
        outputTokens: 20,
      });

      childSpy.mockRestore();
      childMock.mockRestore();
    });

    it("should use Anthropic provider when model is claude", async () => {
      const service = AIService.createFresh(
        { apiKey: "test-key", model: "claude-haiku-4-5" },
        logger,
      );

      await service.generateText("System", "User");

      expect(anthropicSdk.createAnthropic).toHaveBeenCalledWith({
        apiKey: "test-key",
      });
    });

    it("should handle generation errors", async () => {
      const service = AIService.createFresh({}, logger);
      const error = new Error("Generation failed");

      generateTextSpy.mockRejectedValueOnce(error);

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

      expect(generateTextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 1000,
        }),
      );
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
        providerOptions: {
          anthropic: { structuredOutputMode: "jsonTool" },
        },
      });
    });

    it("should handle object generation errors", async () => {
      const service = AIService.createFresh({}, logger);
      const error = new Error("Object generation failed");

      generateObjectSpy.mockRejectedValueOnce(error);

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

      generateTextSpy.mockRejectedValueOnce(customError);

      void expect(service.generateText("System", "User")).rejects.toThrow(
        "AI text generation failed",
      );
    });
  });

  describe("Image Generation", () => {
    describe("canGenerateImages", () => {
      it("should return false when no image provider keys are set", () => {
        const service = AIService.createFresh({}, logger);
        expect(service.canGenerateImages()).toBe(false);
      });

      it("should return true when apiKey is set (OpenAI)", () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);
        expect(service.canGenerateImages()).toBe(true);
      });

      it("should return true when imageApiKey is set", () => {
        const service = AIService.createFresh(
          { imageApiKey: "sk-img" },
          logger,
        );
        expect(service.canGenerateImages()).toBe(true);
      });
    });

    describe("generateImage with OpenAI", () => {
      it("should generate image with default options", async () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        const result = await service.generateImage("A sunset");

        expect(result.base64).toBe(VALID_PNG_BASE64);
        expect(result.dataUrl).toBe(
          `data:image/png;base64,${VALID_PNG_BASE64}`,
        );
      });

      it("should map aspectRatio to DALL-E size for OpenAI provider", async () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        await service.generateImage("A sunset", { aspectRatio: "1:1" });

        expect(generateImageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            size: "1024x1024",
          }),
        );
      });

      it("should map 16:9 to 1536x1024", async () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        await service.generateImage("A sunset", { aspectRatio: "16:9" });

        expect(generateImageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            size: "1536x1024",
          }),
        );
      });

      it("should map 9:16 to 1024x1536", async () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        await service.generateImage("A sunset", { aspectRatio: "9:16" });

        expect(generateImageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            size: "1024x1536",
          }),
        );
      });

      it("should default to 16:9 (1536x1024) when no aspectRatio given", async () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        await service.generateImage("A sunset");

        expect(generateImageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            size: "1536x1024",
          }),
        );
      });
    });

    describe("generateImage with Google", () => {
      it("should use Google provider when imageModel is a gemini model", async () => {
        const service = AIService.createFresh(
          { apiKey: "sk-test", imageModel: "gemini-3-pro-image-preview" },
          logger,
        );

        const result = await service.generateImage("A sunset");

        expect(result.base64).toBe(VALID_PNG_BASE64);
        expect(mockGoogleImage).toHaveBeenCalledWith(
          "gemini-3-pro-image-preview",
        );
      });

      it("should pass aspectRatio directly to Google provider", async () => {
        const service = AIService.createFresh(
          { apiKey: "sk-test", imageModel: "gemini-3-pro-image-preview" },
          logger,
        );

        await service.generateImage("A sunset", { aspectRatio: "16:9" });

        expect(generateImageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            aspectRatio: "16:9",
          }),
        );
      });

      it("should not pass size to Google provider", async () => {
        const service = AIService.createFresh(
          { apiKey: "sk-test", imageModel: "gemini-3-pro-image-preview" },
          logger,
        );

        await service.generateImage("A sunset", { aspectRatio: "1:1" });

        const call = generateImageSpy.mock.calls[0]?.[0];
        expect(call).not.toHaveProperty("size");
      });
    });

    describe("provider selection", () => {
      it("should use imageModel to select provider", async () => {
        const service = AIService.createFresh(
          {
            apiKey: "sk-test",

            imageModel: "gemini-3-pro-image-preview",
          },
          logger,
        );

        await service.generateImage("A sunset");

        expect(mockGoogleImage).toHaveBeenCalled();
      });

      it("should auto-detect OpenAI when only apiKey is set", async () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        await service.generateImage("A sunset");

        expect(mockOpenAIImage).toHaveBeenCalledWith("gpt-image-1.5");
      });

      it("should use Google when imageModel is gemini", async () => {
        const service = AIService.createFresh(
          { apiKey: "sk-test", imageModel: "gemini-3-pro-image-preview" },
          logger,
        );

        await service.generateImage("A sunset");

        expect(mockGoogleImage).toHaveBeenCalled();
      });

      it("should prefer OpenAI when both keys are set and no default", async () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        await service.generateImage("A sunset");

        expect(mockOpenAIImage).toHaveBeenCalledWith("gpt-image-1.5");
      });

      it("should pass imageModel to Google provider", async () => {
        const service = AIService.createFresh(
          {
            apiKey: "sk-test",
            imageModel: "gemini-3-pro-image-preview",
          },
          logger,
        );

        await service.generateImage("A sunset");

        expect(mockGoogleImage).toHaveBeenCalledWith(
          "gemini-3-pro-image-preview",
        );
      });
    });

    describe("error handling", () => {
      it("should throw when no image provider is available", () => {
        const service = AIService.createFresh({}, logger);

        void expect(service.generateImage("A sunset")).rejects.toThrow(
          "Image generation not available",
        );
      });

      it("should handle generation API errors", () => {
        const service = AIService.createFresh({ apiKey: "sk-test" }, logger);

        generateImageSpy.mockRejectedValueOnce(
          new Error("Rate limit exceeded"),
        );

        void expect(service.generateImage("A sunset")).rejects.toThrow(
          "Image generation failed",
        );
      });
    });
  });
});
