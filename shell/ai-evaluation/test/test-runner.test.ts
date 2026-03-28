import { describe, it, expect, beforeEach, mock } from "bun:test";

import { TestRunner } from "../src/test-runner";
import type { TestCase } from "../src/schemas";
import type { IAgentService, AgentResponse } from "@brains/ai-service";

describe("TestRunner", () => {
  let mockAgentService: IAgentService;
  let testRunner: TestRunner;

  const createMockResponse = (
    overrides: Partial<AgentResponse> = {},
  ): AgentResponse => ({
    text: "Test response",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    toolResults: [],
    ...overrides,
  });

  beforeEach(() => {
    mockAgentService = {
      chat: mock(() => Promise.resolve(createMockResponse())),
      confirmPendingAction: mock(() => Promise.resolve(createMockResponse())),
      invalidateAgent: (): void => {},
    };
    testRunner = TestRunner.createFresh(mockAgentService);
  });

  describe("runTest", () => {
    it("should pass when all criteria are met", async () => {
      const testCase: TestCase = {
        id: "test-1",
        name: "Basic Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Hello" }],
        successCriteria: {
          responseContains: ["response"],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
      expect(result.testCaseId).toBe("test-1");
      expect(result.failures).toHaveLength(0);
    });

    it("should fail when responseContains criteria not met", async () => {
      const testCase: TestCase = {
        id: "test-2",
        name: "Contains Test",
        type: "response_quality",
        turns: [{ userMessage: "Hello" }],
        successCriteria: {
          responseContains: ["missing text"],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0]?.criterion).toBe("responseContains");
    });

    it("should fail when responseNotContains criteria violated", async () => {
      const testCase: TestCase = {
        id: "test-3",
        name: "Not Contains Test",
        type: "response_quality",
        turns: [{ userMessage: "Hello" }],
        successCriteria: {
          responseNotContains: ["response"],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(false);
      expect(
        result.failures.some((f) => f.criterion === "responseNotContains"),
      ).toBe(true);
    });

    it("should verify expected tool calls", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [{ toolName: "system_search", data: "results" }],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-4",
        name: "Tool Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Search for something" }],
        successCriteria: {
          expectedTools: [{ toolName: "system_search", shouldBeCalled: true }],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
      expect(result.totalMetrics.toolCallCount).toBe(1);
    });

    it("should fail when expected tool not called", async () => {
      const testCase: TestCase = {
        id: "test-5",
        name: "Missing Tool Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Search for something" }],
        successCriteria: {
          expectedTools: [{ toolName: "system_search", shouldBeCalled: true }],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(false);
      expect(result.failures.some((f) => f.criterion === "expectedTool")).toBe(
        true,
      );
    });

    it("should track metrics correctly", async () => {
      const testCase: TestCase = {
        id: "test-6",
        name: "Metrics Test",
        type: "tool_invocation",
        turns: [
          { userMessage: "First message" },
          { userMessage: "Second message" },
        ],
        successCriteria: {},
      };

      const result = await testRunner.runTest(testCase);

      expect(result.turnResults).toHaveLength(2);
      expect(result.totalMetrics.turnCount).toBe(2);
      expect(result.totalMetrics.totalTokens).toBe(300); // 150 per turn
    });

    it("should verify tool args with argsContain", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "system_create",
                args: { entityType: "image", prompt: "a landscape" },
                data: "ok",
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-args",
        name: "Args Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Create an image" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsContain: { entityType: "image" },
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);
      expect(result.passed).toBe(true);
    });

    it("should fail when argsContain value doesn't match", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "system_create",
                args: { entityType: "note" },
                data: "ok",
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-args-fail",
        name: "Args Mismatch Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Create an image" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsContain: { entityType: "image" },
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);
      expect(result.passed).toBe(false);
      expect(
        result.failures.some((f) => f.criterion === "toolArgsContain"),
      ).toBe(true);
    });

    it("should support dot-notation paths in argsContain", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "system_create",
                args: {
                  entityType: "image",
                  options: {
                    targetEntityType: "post",
                    targetEntityId: "my-post",
                  },
                },
                data: "ok",
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-nested-args",
        name: "Nested Args Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Generate a cover image" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsContain: {
                entityType: "image",
                "options.targetEntityType": "post",
                "options.targetEntityId": "my-post",
              },
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);
      expect(result.passed).toBe(true);
    });

    it("should fail when nested dot-notation path doesn't match", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "system_create",
                args: {
                  entityType: "image",
                  options: { targetEntityType: "note" },
                },
                data: "ok",
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-nested-args-fail",
        name: "Nested Args Mismatch Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Generate a cover image" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsContain: { "options.targetEntityType": "post" },
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);
      expect(result.passed).toBe(false);
      expect(
        result.failures.some((f) => f.criterion === "toolArgsContain"),
      ).toBe(true);
    });

    it("should check efficiency constraints", async () => {
      const testCase: TestCase = {
        id: "test-7",
        name: "Efficiency Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Hello" }],
        successCriteria: {},
        efficiency: {
          maxTokens: 100, // Less than our mock's 150
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(false);
      expect(result.efficiencyPassed).toBe(false);
      expect(
        result.efficiencyFailures?.some((f) => f.criterion === "maxTokens"),
      ).toBe(true);
    });
  });
});
