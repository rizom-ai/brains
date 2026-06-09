import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it, mock } from "bun:test";

import type {
  IAgentService,
  IAIService,
  AgentResponse,
  AIModelConfig,
  JudgeInput,
} from "@brains/ai-service";
import type { z } from "@brains/utils";
import type { LanguageModel } from "ai";

import { EvaluationService } from "../src/evaluation-service";
import { EvalHandlerRegistry } from "../src/eval-handler-registry";

const createResponse = (text: string): AgentResponse => ({
  text,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  toolResults: [],
});

const createAIService = (): IAIService => ({
  generateText: async () => ({
    text: "ok",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  }),
  generateObject: async <T>(
    _systemPrompt: string,
    _userPrompt: string,
    schema: z.ZodType<T>,
  ) => ({
    object: schema.parse({}),
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  }),
  judge: async <T>(input: JudgeInput<T>) => ({
    verdict: input.schema.parse({}),
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  }),
  updateConfig: (_config: Partial<AIModelConfig>): void => {},
  getConfig: (): AIModelConfig => ({}),
  getModel: (): LanguageModel => {
    throw new Error("getModel is not used by these tests");
  },
  generateImage: async () => ({
    base64: "",
    dataUrl: "data:image/png;base64,",
  }),
  canGenerateImages: () => false,
});

const writeAgentTestCase = async (
  directory: string,
  index: number,
): Promise<void> => {
  await writeFile(
    join(directory, `parallel-${index}.yaml`),
    `id: parallel-${index}
name: Parallel ${index}
type: tool_invocation
turns:
  - userMessage: Message ${index}
successCriteria:
  responseContains:
    - ok
`,
  );
};

const writePluginTestCase = async (
  directory: string,
  index: number,
): Promise<void> => {
  await writeFile(
    join(directory, `plugin-${index}.yaml`),
    `id: plugin-${index}
name: Plugin ${index}
type: plugin
plugin: test
handler: echo
input:
  index: ${index}
expectedOutput:
  validateEach:
    - path: ok
      equals: true
`,
  );
};

describe("EvaluationService", () => {
  it("runs agent tests with a concurrency limit while preserving result order", async () => {
    const testCaseDirectory = await mkdtemp(join(tmpdir(), "ai-eval-"));

    try {
      await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          writeAgentTestCase(testCaseDirectory, index),
        ),
      );

      let activeChats = 0;
      let maxActiveChats = 0;

      const agentService: IAgentService = {
        chat: mock(async (message: string) => {
          activeChats += 1;
          maxActiveChats = Math.max(maxActiveChats, activeChats);

          const index = Number(message.match(/\d+$/)?.[0] ?? 0);
          await new Promise((resolve) => setTimeout(resolve, 30 - index * 3));

          activeChats -= 1;
          return createResponse(`ok ${message}`);
        }),
        confirmPendingAction: mock(async () => createResponse("ok")),
        invalidateAgent: (): void => {},
      };

      const service = EvaluationService.createFresh({
        agentService,
        aiService: createAIService(),
        testCasesDirectory: testCaseDirectory,
        evalHandlerRegistry: EvalHandlerRegistry.createFresh(),
      });

      const expectedOrder = (await service.listTestCases()).map(
        (testCase) => testCase.id,
      );
      const summary = await service.runEvaluations({
        skipLLMJudge: true,
        parallel: true,
        maxParallel: 2,
      });

      expect(summary.totalTests).toBe(5);
      expect(summary.passedTests).toBe(5);
      expect(maxActiveChats).toBe(2);
      expect(summary.results.map((result) => result.testCaseId)).toEqual(
        expectedOrder,
      );
    } finally {
      await rm(testCaseDirectory, { recursive: true, force: true });
    }
  });

  it("preserves mixed agent and plugin test order", async () => {
    const testCaseDirectory = await mkdtemp(join(tmpdir(), "ai-eval-"));

    try {
      await writeAgentTestCase(testCaseDirectory, 0);
      await writePluginTestCase(testCaseDirectory, 1);

      const agentService: IAgentService = {
        chat: mock(async () => createResponse("ok")),
        confirmPendingAction: mock(async () => createResponse("ok")),
        invalidateAgent: (): void => {},
      };
      const registry = EvalHandlerRegistry.createFresh();
      registry.register("test", "echo", async () => ({ ok: true }));

      const service = EvaluationService.createFresh({
        agentService,
        aiService: createAIService(),
        testCasesDirectory: testCaseDirectory,
        evalHandlerRegistry: registry,
      });

      const requestedOrder = ["plugin-1", "parallel-0"];
      const summary = await service.runEvaluations({
        skipLLMJudge: true,
        testCaseIds: requestedOrder,
      });

      expect(summary.results.map((result) => result.testCaseId)).toEqual(
        requestedOrder,
      );
    } finally {
      await rm(testCaseDirectory, { recursive: true, force: true });
    }
  });

  it("waits for the semantic index before running agent tests", async () => {
    const testCaseDirectory = await mkdtemp(join(tmpdir(), "ai-eval-"));

    try {
      await writeAgentTestCase(testCaseDirectory, 0);

      const events: string[] = [];
      const agentService: IAgentService = {
        chat: mock(async () => {
          events.push("chat");
          return createResponse("ok");
        }),
        confirmPendingAction: mock(async () => createResponse("ok")),
        invalidateAgent: (): void => {},
      };

      const service = EvaluationService.createFresh({
        agentService,
        aiService: createAIService(),
        testCasesDirectory: testCaseDirectory,
        evalHandlerRegistry: EvalHandlerRegistry.createFresh(),
        indexReadiness: {
          awaitIndexReady: mock(async () => {
            events.push("ready");
            return { ready: true, degraded: false };
          }),
        },
      });

      await service.runEvaluations({ skipLLMJudge: true });

      expect(events).toEqual(["ready", "chat"]);
    } finally {
      await rm(testCaseDirectory, { recursive: true, force: true });
    }
  });
});
