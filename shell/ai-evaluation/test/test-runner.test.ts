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

    it("should default eval callers to public permission", async () => {
      const testCase: TestCase = {
        id: "test-default-public",
        name: "Default Public Permission Test",
        type: "response_quality",
        turns: [{ userMessage: "Hello" }],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = (
        mockAgentService.chat as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "public",
        interfaceType: "evaluation",
      });
    });

    it("should pass configured interface and channel context to chat", async () => {
      const testCase: TestCase = {
        id: "test-channel-context",
        name: "Channel Context Test",
        type: "response_quality",
        setup: {
          permissionLevel: "trusted",
          interfaceType: "discord",
          channelId: "relay-poc",
          channelName: "Relay POC",
        },
        turns: [{ userMessage: "Hello" }],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = (
        mockAgentService.chat as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "trusted",
        interfaceType: "discord",
        channelId: "relay-poc",
        channelName: "Relay POC",
      });
    });

    it("should pass native turn attachments to chat", async () => {
      const testCase: TestCase = {
        id: "test-turn-attachments",
        name: "Turn Attachment Test",
        type: "response_quality",
        turns: [
          {
            userMessage: "Describe this image",
            attachments: [
              {
                kind: "file",
                filename: "robot.png",
                mediaType: "image/png",
                dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString(
                  "base64",
                ),
              },
            ],
          },
        ],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = (
        mockAgentService.chat as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "public",
        interfaceType: "evaluation",
        attachments: [
          {
            kind: "file",
            filename: "robot.png",
            mediaType: "image/png",
            data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
            sizeBytes: 4,
          },
        ],
      });
    });

    it("should reuse previous attachments when a turn asks for them", async () => {
      const testCase: TestCase = {
        id: "test-reuse-attachments",
        name: "Reuse Attachment Test",
        type: "multi_turn",
        turns: [
          {
            userMessage: "",
            attachments: [
              {
                kind: "text",
                filename: "notes.md",
                mediaType: "text/markdown",
                content: "# Notes",
              },
            ],
          },
          {
            userMessage: "Summarize that file",
            reusePreviousAttachments: true,
          },
        ],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = (
        mockAgentService.chat as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls;
      expect(calls[1]?.[2]).toEqual({
        userPermissionLevel: "public",
        interfaceType: "evaluation",
        attachments: [
          {
            kind: "text",
            filename: "notes.md",
            mediaType: "text/markdown",
            content: "# Notes",
          },
        ],
      });
    });

    it("should resolve pending confirmations when a turn requests confirmation", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            text: "Confirmation required.",
            cards: [
              {
                kind: "tool-approval",
                id: "approval:system_update",
                toolName: "system_update",
                summary: "Update agent?",
                state: "approval-requested",
              },
            ],
          }),
        ),
      );
      mockAgentService.confirmPendingAction = mock(() =>
        Promise.resolve(createMockResponse({ text: "Action confirmed." })),
      );

      const testCase: TestCase = {
        id: "test-confirmation-turn",
        name: "Confirmation Turn Test",
        type: "multi_turn",
        turns: [
          { userMessage: "Approve old-agent.io" },
          { userMessage: "Approve confirmation", confirmPendingAction: true },
        ],
        successCriteria: {
          responseContains: ["Action confirmed"],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
      expect(mockAgentService.chat).toHaveBeenCalledTimes(1);
      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        expect.any(String),
        true,
        "approval:system_update",
      );
    });

    it("should pass explicit approval ids for multi-confirmation eval turns", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            text: "Confirmation required.",
            pendingConfirmations: [
              {
                id: "approval:update",
                toolName: "system_update",
                summary: "Update agent?",
                args: { entityType: "agent", id: "old-agent.io" },
              },
              {
                id: "approval:delete",
                toolName: "system_delete",
                summary: "Delete note?",
                args: { entityType: "note", id: "note-1" },
              },
            ],
          }),
        ),
      );
      mockAgentService.confirmPendingAction = mock(() =>
        Promise.resolve(createMockResponse({ text: "Action confirmed." })),
      );

      const testCase: TestCase = {
        id: "test-explicit-approval-id",
        name: "Explicit Approval ID Test",
        type: "multi_turn",
        turns: [
          { userMessage: "Prepare update and delete" },
          {
            userMessage: "Approve delete",
            confirmPendingAction: true,
            approvalId: "approval:delete",
          },
        ],
        successCriteria: {
          responseContains: ["Action confirmed"],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        expect.any(String),
        true,
        "approval:delete",
      );
    });

    it("should use explicit eval permission when provided", async () => {
      const testCase: TestCase = {
        id: "test-explicit-anchor",
        name: "Explicit Anchor Permission Test",
        type: "tool_invocation",
        setup: { permissionLevel: "anchor" },
        turns: [{ userMessage: "Hello" }],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = (
        mockAgentService.chat as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "anchor",
        interfaceType: "evaluation",
      });
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

    it("should verify tool args with argsAbsent", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "system_create",
                args: { entityType: "deck", content: "# Final deck" },
                data: "ok",
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-args-absent",
        name: "Args Absent Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Create this finalized deck" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsContain: { entityType: "deck" },
              argsAbsent: ["prompt"],
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);
      expect(result.passed).toBe(true);
    });

    it("should treat empty optional args as absent for argsAbsent", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "system_create",
                args: { entityType: "deck", prompt: "", content: "# Final" },
                data: "ok",
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-args-absent-empty",
        name: "Args Absent Empty Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Create this finalized deck" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsAbsent: ["prompt"],
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);
      expect(result.passed).toBe(true);
    });

    it("should fail when argsAbsent path exists", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "system_create",
                args: { entityType: "deck", prompt: "Generate a deck" },
                data: "ok",
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-args-absent-fail",
        name: "Args Absent Failure Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Create this finalized deck" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsAbsent: ["prompt"],
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);
      expect(result.passed).toBe(false);
      expect(
        result.failures.some((f) => f.criterion === "toolArgsAbsent"),
      ).toBe(true);
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
