import { generateText, generateObject, dynamicTool, stepCountIs } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { Logger } from "@brains/utils";
import type { z } from "@brains/utils";
import type {
  AIModelConfig,
  IAIService,
  GenerateWithToolsOptions,
  GenerateWithToolsResult,
  ToolCallResult,
} from "./types";

/**
 * Default model configuration
 */
const DEFAULT_MODEL = "claude-3-5-haiku-latest";

/**
 * AI Service for generating responses using Vercel AI SDK
 */
export class AIService implements IAIService {
  private static instance: AIService | null = null;
  private config: AIModelConfig;
  private logger: Logger;
  private anthropicProvider;

  /**
   * Get the singleton instance
   */
  public static getInstance(config: AIModelConfig, logger: Logger): AIService {
    AIService.instance ??= new AIService(config, logger);
    return AIService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    AIService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config: AIModelConfig, logger: Logger): AIService {
    return new AIService(config, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: AIModelConfig, logger: Logger) {
    this.config = {
      ...config,
      model: config.model ?? DEFAULT_MODEL,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 1000,
      webSearch: config.webSearch ?? true, // Default to true
    };
    this.logger = logger.child("AIService");

    // Create provider with API key if provided
    this.anthropicProvider = config.apiKey
      ? createAnthropic({ apiKey: config.apiKey })
      : anthropic;
  }

  /**
   * Get the Anthropic model instance
   */
  private getModel(): LanguageModel {
    const { model } = this.config;
    return this.anthropicProvider(model ?? DEFAULT_MODEL);
  }

  /**
   * Generate text response
   */
  public async generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{
    text: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    this.logger.debug("Generating text response", {
      model: this.config.model,
    });

    try {
      const result = await generateText({
        model: this.getModel(),
        system: systemPrompt,
        prompt: userPrompt,
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
        ...(this.config.maxTokens !== undefined && {
          maxTokens: this.config.maxTokens,
        }),
        ...(this.config.webSearch && {
          webSearch: true,
        }),
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate text", error);
      throw new Error("AI text generation failed");
    }
  }

  /**
   * Generate structured object response
   */
  public async generateObject<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<{
    object: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    this.logger.debug("Generating structured response", {
      model: this.config.model,
    });

    try {
      // @ts-ignore - Type instantiation issue with Zod v3 and AI SDK
      const result = await generateObject({
        model: this.getModel(),
        system: systemPrompt,
        prompt: userPrompt,
        schema,
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
        ...(this.config.maxTokens !== undefined && {
          maxTokens: this.config.maxTokens,
        }),
        ...(this.config.webSearch && {
          webSearch: true,
        }),
      });

      return {
        object: result.object as T,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate object", error);
      throw new Error("AI object generation failed");
    }
  }

  /**
   * Generate text with tool calling support
   */
  public async generateWithTools(
    options: GenerateWithToolsOptions,
  ): Promise<GenerateWithToolsResult> {
    this.logger.debug("Generating with tools", {
      model: this.config.model,
      toolCount: options.tools.length,
      maxSteps: options.maxSteps,
    });

    try {
      // Convert our tool format to Vercel AI SDK dynamic tool format
      // dynamicTool accepts unknown types, suitable for runtime-defined tools
      const sdkTools: Record<string, ReturnType<typeof dynamicTool>> = {};
      for (const t of options.tools) {
        sdkTools[t.name] = dynamicTool({
          description: t.description,
          inputSchema: t.inputSchema,
          execute: t.execute,
        });
      }

      // Convert messages to SDK format
      const messages = options.messages.map((msg) => {
        if (msg.role === "tool") {
          return {
            role: "tool" as const,
            content: [
              {
                type: "tool-result" as const,
                toolCallId: msg.toolCallId ?? "",
                toolName: msg.toolName ?? "",
                output: { type: "json" as const, value: msg.content },
              },
            ],
          };
        }
        return {
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        };
      });

      const result = await generateText({
        model: this.getModel(),
        system: options.system,
        messages,
        tools: sdkTools,
        stopWhen: stepCountIs(options.maxSteps ?? 10),
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
        ...(this.config.maxTokens !== undefined && {
          maxTokens: this.config.maxTokens,
        }),
        ...(this.config.webSearch && {
          webSearch: true,
        }),
      });

      // Extract tool call results from the response
      const toolCalls: ToolCallResult[] = result.toolCalls.map((tc) => {
        const toolResult = result.toolResults.find(
          (tr) => tr.toolCallId === tc.toolCallId,
        );
        return {
          name: tc.toolName,
          args: "input" in tc ? tc.input : {},
          result:
            toolResult && "output" in toolResult ? toolResult.output : null,
        };
      });

      return {
        text: result.text,
        toolCalls,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate with tools", error);
      throw new Error("AI generation with tools failed");
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AIModelConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info("AI configuration updated", {
      model: this.config.model,
    });
  }

  /**
   * Get current configuration
   */
  public getConfig(): AIModelConfig {
    return { ...this.config };
  }
}
