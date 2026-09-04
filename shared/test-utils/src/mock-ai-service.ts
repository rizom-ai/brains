import { mock } from "bun:test";
import type { IAIService } from "@brains/ai-service";
import { genericSpy } from "./generic-spy";

/**
 * Options for configuring mock AI service return values
 */
export interface MockAIServiceReturns {
  generateText?: {
    text: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
  generateObject?: unknown;
  getConfig?: Record<string, unknown>;
}

/**
 * Options for creating a mock AI service
 */
export interface MockAIServiceOptions {
  returns?: MockAIServiceReturns;
}

const defaultUsage = {
  promptTokens: 10,
  completionTokens: 20,
  totalTokens: 30,
};

/**
 * Create a mock AI service with all methods pre-configured.
 * The cast to IAIService is centralized here so test files don't need unsafe casts.
 *
 * @example
 * ```ts
 * const mockAI = createMockAIService({
 *   returns: {
 *     generateText: { text: "Hello world" },
 *     generateObject: { title: "Test" },
 *   },
 * });
 * ```
 */
export function createMockAIService(
  options: MockAIServiceOptions = {},
): IAIService {
  const { returns = {} } = options;

  const generateTextReturn = returns.generateText ?? {
    text: "",
    usage: defaultUsage,
  };
  const generateObjectReturn = returns.generateObject ?? {};
  const configReturn = returns.getConfig ?? {};

  return {
    generateText: mock(() =>
      Promise.resolve({
        text: generateTextReturn.text,
        usage: generateTextReturn.usage ?? defaultUsage,
      }),
    ),
    generateObject: genericSpy<IAIService["generateObject"]>(
      mock(() =>
        Promise.resolve({ object: generateObjectReturn, usage: defaultUsage }),
      ),
    ),
    judge: genericSpy<IAIService["judge"]>(
      mock(() =>
        Promise.resolve({ verdict: generateObjectReturn, usage: defaultUsage }),
      ),
    ),
    generateImage: mock(() =>
      Promise.resolve({
        base64: "",
        dataUrl: "data:image/png;base64,",
      }),
    ),
    canGenerateImages: mock(() => false),
    updateConfig: mock(() => {}),
    getConfig: mock(() => configReturn),
    // Throws rather than returning an empty object asserted into a language
    // model: a test that reaches for the model should say so.
    getModel: mock((): ReturnType<IAIService["getModel"]> => {
      throw new Error("getModel is not stubbed in the mock AI service");
    }),
  } satisfies IAIService;
}
