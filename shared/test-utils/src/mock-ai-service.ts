import { mock } from "bun:test";
import type { IAIService } from "@brains/ai-service";

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
    // `mock()` erases type parameters, so this cannot be assigned to the
    // generic `generateObject<T>` signature directly. Asserting the member
    // keeps it a real spy; every other member stays checked by `satisfies`.
    generateObject: mock(() =>
      Promise.resolve({
        object: generateObjectReturn,
        usage: defaultUsage,
      }),
    ) as IAIService["generateObject"],
    judge: mock(() =>
      Promise.resolve({ verdict: generateObjectReturn, usage: defaultUsage }),
    ) as IAIService["judge"],
    generateImage: mock(() =>
      Promise.resolve({
        base64: "",
        dataUrl: "data:image/png;base64,",
      }),
    ),
    canGenerateImages: mock(() => false),
    updateConfig: mock(() => {}),
    getConfig: mock(() => configReturn),
    getModel: mock(() => ({}) as ReturnType<IAIService["getModel"]>),
  } satisfies IAIService;
}
