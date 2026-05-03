import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it, mock } from "bun:test";

import type {
  IAgentService,
  IAIService,
  AgentResponse,
} from "@brains/ai-service";

import { EvaluationService } from "../src/evaluation-service";
import { EvalHandlerRegistry } from "../src/eval-handler-registry";

const createResponse = (text: string): AgentResponse => ({
  text,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  toolResults: [],
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
        aiService: {} as IAIService,
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
});
