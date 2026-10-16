import { describe, it, expect, beforeEach, mock, type Mock } from "bun:test";

import { TestRunner } from "../src/test-runner";
import type { ILLMJudge, RequirementVerdict } from "../src/types";
import type { AgentTestCase, TestCase } from "../src/schemas";
import type { IAgentService, AgentResponse } from "@brains/ai-service";
import type {
  IRuntimeUploadsNamespace,
  RuntimeUploadRecord,
  ScopedRuntimeUploadStore,
} from "@brains/plugins";

/** A store member this test does not stub: reaching it is the failure. */
function notStubbed(name: string): () => never {
  return () => {
    throw new Error(`scoped upload store: ${name} is not stubbed`);
  };
}

describe("TestRunner", () => {
  // Typed so chat keeps the spy it is built with. Annotating this as a plain
  // IAgentService erased that, and six assertions had to widen the member back
  // to reach its recorded calls.
  let mockAgentService: IAgentService & {
    chat: Mock<IAgentService["chat"]>;
  };
  let testRunner: TestRunner;

  const requirement =
    "Lists the team's knowledge sources, including decks and docs.";
  const judgedCase = (): AgentTestCase => ({
    id: "judged-requirements",
    name: "Judged requirements",
    type: "response_quality",
    turns: [
      {
        userMessage: "What can I find in team memory?",
        successCriteria: { responseCriteria: [requirement] },
      },
    ],
    successCriteria: {},
  });
  const judgeReturning = (
    verdicts: RequirementVerdict[] | null,
  ): ILLMJudge & {
    judgeRequirements: Mock<ILLMJudge["judgeRequirements"]>;
  } => ({
    scoreConversation: mock(async () => null),
    judgeRequirements: mock(async () => verdicts),
  });

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

  describe("judged response requirements", () => {
    it("fails a turn whose reply does not meet a judged requirement", async () => {
      const judge = judgeReturning([
        { requirement, met: false, reason: "Mentions notes only." },
      ]);
      const runner = TestRunner.createFresh(mockAgentService, judge);

      const result = await runner.runTest(judgedCase());

      expect(result.passed).toBe(false);
      expect(result.failures).toContainEqual(
        expect.objectContaining({
          criterion: "responseCriteria",
          expected: requirement,
          actual: "Mentions notes only.",
        }),
      );
      expect(judge.judgeRequirements).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: "What can I find in team memory?",
          response: createMockResponse().text,
          requirements: [requirement],
        }),
      );
    });

    it("passes when every judged requirement is met", async () => {
      const runner = TestRunner.createFresh(
        mockAgentService,
        judgeReturning([{ requirement, met: true, reason: "Lists both." }]),
      );
      const result = await runner.runTest(judgedCase());
      expect(result.passed).toBe(true);
      expect(result.unjudgedRequirements).toBeUndefined();
    });

    it("lists requirements it could not judge instead of passing them silently", async () => {
      const runs = [
        TestRunner.createFresh(mockAgentService).runTest(judgedCase()),
        TestRunner.createFresh(
          mockAgentService,
          judgeReturning([{ requirement, met: false, reason: "No." }]),
        ).runTest(judgedCase(), { skipLLMJudge: true }),
        TestRunner.createFresh(mockAgentService, judgeReturning(null)).runTest(
          judgedCase(),
        ),
      ];
      for (const result of await Promise.all(runs)) {
        expect(result.passed).toBe(true);
        expect(result.unjudgedRequirements).toEqual([requirement]);
      }
    });
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

    it("does not erase a rejected SDK attempt when a repaired call requests approval", async () => {
      const bad = {
        entityType: "note",
        id: "plan",
        operation: {
          kind: "edits",
          edits: [{ oldText: "old", newText: "new" }],
          fields: { title: "New" },
        },
      };
      mockAgentService.chat.mockResolvedValue(
        createMockResponse({
          text: "Confirmation required.",
          toolResults: [
            {
              toolName: "system_update",
              args: bad,
              error: {
                code: "invalid_tool_call",
                message: "Mixed operation branches",
              },
            },
          ],
          pendingConfirmations: [
            {
              id: "approval",
              toolName: "system_update",
              summary: "Update plan?",
              args: {
                entityType: "note",
                id: "plan",
                operation: { kind: "edits", edits: bad.operation.edits },
              },
            },
          ],
        }),
      );
      const result = await testRunner.runTest({
        id: "rejected-then-repaired",
        name: "Rejected attempt remains red",
        type: "tool_invocation",
        turns: [{ userMessage: "Edit the plan." }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_update",
              shouldBeCalled: true,
              argsAbsent: ["operation.fields"],
              resultContains: { needsConfirmation: true },
            },
          ],
        },
      });
      expect(result.passed).toBe(false);
      expect(result.totalMetrics.toolCallCount).toBe(2);
      expect(result.turnResults[0]?.toolCalls).toHaveLength(2);
      expect(result.failures.map((failure) => failure.criterion)).toContain(
        "toolArgsAbsent",
      );
      expect(result.failures.map((failure) => failure.criterion)).toContain(
        "toolResultContains",
      );
    });

    it("should default eval callers to admin permission", async () => {
      const testCase: TestCase = {
        id: "test-default-admin",
        name: "Default Admin Permission Test",
        type: "response_quality",
        turns: [{ userMessage: "Hello" }],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = mockAgentService.chat.mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "admin",
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
          isAnchor: true,
          interfaceType: "discord",
          channelId: "relay-poc",
          channelName: "Relay POC",
        },
        turns: [{ userMessage: "Hello" }],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = mockAgentService.chat.mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "trusted",
        isAnchor: true,
        interfaceType: "discord",
        channelId: "relay-poc",
        channelName: "Relay POC",
      });
    });

    it("should allow each turn to override chat context for multi-user conversations", async () => {
      const testCase: TestCase = {
        id: "test-multi-user-context",
        name: "Multi-user Context Test",
        type: "multi_turn",
        setup: {
          permissionLevel: "admin",
          interfaceType: "evaluation",
          channelId: "shared-thread",
        },
        turns: [
          {
            userMessage: "Save this private note",
            context: {
              userPermissionLevel: "admin",
              isAnchor: false,
              actor: {
                identity: {
                  kind: "user",
                  userId: "usr_alice",
                  canonicalId: "alice",
                },
                interfaceType: "evaluation",
                role: "user",
                displayName: "Alice",
              },
              source: {
                messageId: "msg-1",
                channelId: "shared-thread",
                threadId: "thread-1",
              },
            },
          },
          {
            userMessage: "What private note did Alice save?",
            context: {
              userPermissionLevel: "public",
              isAnchor: true,
              actor: {
                identity: {
                  kind: "user",
                  userId: "usr_bob",
                  canonicalId: "bob",
                },
                interfaceType: "evaluation",
                role: "user",
                displayName: "Bob",
              },
              source: {
                messageId: "msg-2",
                channelId: "shared-thread",
                threadId: "thread-1",
              },
            },
          },
        ],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = mockAgentService.chat.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[1]).toBe(calls[1]?.[1]);
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "admin",
        isAnchor: false,
        interfaceType: "evaluation",
        channelId: "shared-thread",
        actor: {
          identity: {
            kind: "user",
            userId: "usr_alice",
            canonicalId: "alice",
          },
          interfaceType: "evaluation",
          role: "user",
          displayName: "Alice",
        },
        source: {
          messageId: "msg-1",
          channelId: "shared-thread",
          threadId: "thread-1",
        },
      });
      expect(calls[1]?.[2]).toEqual({
        userPermissionLevel: "public",
        isAnchor: true,
        interfaceType: "evaluation",
        channelId: "shared-thread",
        actor: {
          identity: {
            kind: "user",
            userId: "usr_bob",
            canonicalId: "bob",
          },
          interfaceType: "evaluation",
          role: "user",
          displayName: "Bob",
        },
        source: {
          messageId: "msg-2",
          channelId: "shared-thread",
          threadId: "thread-1",
        },
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

      const calls = mockAgentService.chat.mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "admin",
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

    it("should seed source-backed eval attachments into runtime upload storage", async () => {
      const savedUploads: unknown[] = [];
      const scopedCalls: unknown[] = [];
      const runtimeUploads: IRuntimeUploadsNamespace = {
        scoped: (options): ScopedRuntimeUploadStore => {
          scopedCalls.push(options);
          return {
            save: async (input): Promise<RuntimeUploadRecord> => {
              savedUploads.push(input);
              return {
                id: options.createId?.() ?? "upload-fallback",
                ref: {
                  kind: options.refKind,
                  id: options.createId?.() ?? "upload-fallback",
                },
                filename: "notes.md",
                mediaType: "text/markdown",
                sizeBytes: 7,
                createdAt: new Date().toISOString(),
              };
            },
            // The runner only saves. Stubbing the rest as throwing keeps the
            // store a real ScopedRuntimeUploadStore, so a member added to the
            // interface fails to compile here instead of being asserted away.
            read: notStubbed("read"),
            readRecord: notStubbed("readRecord"),
            toResponseBody: notStubbed("toResponseBody"),
            prune: notStubbed("prune"),
            getUploadDir: notStubbed("getUploadDir"),
            remove: notStubbed("remove"),
          };
        },
      };
      testRunner = TestRunner.createFresh(
        mockAgentService,
        undefined,
        runtimeUploads,
      );
      const testCase: TestCase = {
        id: "test-runtime-upload-seed",
        name: "Runtime Upload Seed Test",
        type: "response_quality",
        turns: [
          {
            userMessage: "",
            attachments: [
              {
                kind: "text",
                filename: "notes.md",
                mediaType: "text/markdown",
                content: "# Notes",
                source: {
                  kind: "upload",
                  id: "upload-00000000-0000-4000-8000-000000000999",
                },
              },
            ],
          },
        ],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      expect(scopedCalls).toEqual([
        {
          namespace: "upload",
          refKind: "upload",
          routePath: "",
          createId: expect.any(Function),
        },
      ]);
      expect(savedUploads).toEqual([
        {
          filename: "notes.md",
          mediaType: "text/markdown",
          content: Buffer.from("# Notes", "utf8"),
        },
      ]);
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

      const calls = mockAgentService.chat.mock.calls;
      expect(calls[1]?.[2]).toEqual({
        userPermissionLevel: "admin",
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
        {
          userPermissionLevel: "admin",
          interfaceType: "evaluation",
        },
      );
    });

    it("should dedupe identical pending confirmations for confirmation turns", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            text: "Confirmation required.",
            pendingConfirmations: [
              {
                id: "approval:create-1",
                toolName: "system_create",
                summary: "Create note?",
                args: { entityType: "note", title: "Same" },
              },
              {
                id: "approval:create-2",
                toolName: "system_create",
                summary: "Create note?",
                args: { entityType: "note", title: "Same" },
              },
            ],
          }),
        ),
      );
      mockAgentService.confirmPendingAction = mock(() =>
        Promise.resolve(createMockResponse({ text: "Action confirmed." })),
      );

      const testCase: TestCase = {
        id: "test-identical-confirmation-dedupe",
        name: "Identical Confirmation Dedupe Test",
        type: "multi_turn",
        turns: [
          { userMessage: "Create a note" },
          { userMessage: "Approve creation", confirmPendingAction: true },
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
        "approval:create-1",
        {
          userPermissionLevel: "admin",
          interfaceType: "evaluation",
        },
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
        {
          userPermissionLevel: "admin",
          interfaceType: "evaluation",
        },
      );
    });

    it("should retain pending approval ids after unauthorized confirmation attempts", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            text: "Confirmation required.",
            pendingConfirmations: [
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
      let confirmCalls = 0;
      mockAgentService.confirmPendingAction = mock(() => {
        confirmCalls += 1;
        return Promise.resolve(
          createMockResponse(
            confirmCalls === 1
              ? {
                  text: "You are not authorized to confirm this pending action.",
                  pendingConfirmations: [
                    {
                      id: "approval:delete",
                      toolName: "system_delete",
                      summary: "Delete note?",
                      args: { entityType: "note", id: "note-1" },
                    },
                  ],
                }
              : { text: "Action confirmed." },
          ),
        );
      });

      const testCase: TestCase = {
        id: "test-unauthorized-confirm-keeps-pending-id",
        name: "Unauthorized Confirm Keeps Pending ID Test",
        type: "multi_turn",
        turns: [
          { userMessage: "Delete note" },
          {
            userMessage: "Bob approves",
            confirmPendingAction: true,
            context: {
              userPermissionLevel: "public",
              actor: {
                identity: { kind: "external", externalActorId: "bob" },
                interfaceType: "evaluation",
                role: "user",
              },
            },
            successCriteria: {
              expectedTools: [
                { toolName: "system_delete", shouldBeCalled: false },
              ],
            },
          },
          {
            userMessage: "Alice approves",
            confirmPendingAction: true,
            context: {
              userPermissionLevel: "admin",
              actor: {
                identity: { kind: "external", externalActorId: "alice" },
                interfaceType: "evaluation",
                role: "user",
              },
            },
          },
        ],
        successCriteria: {
          responseContains: ["Action confirmed"],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
      expect(mockAgentService.confirmPendingAction).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        true,
        "approval:delete",
        expect.objectContaining({ userPermissionLevel: "public" }),
      );
      expect(mockAgentService.confirmPendingAction).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        true,
        "approval:delete",
        expect.objectContaining({ userPermissionLevel: "admin" }),
      );
      expect(result.turnResults[1]?.toolCalls).toEqual([]);
    });

    it("should fail the test instead of throwing when a confirmation turn has no pending approval", async () => {
      const testCase: TestCase = {
        id: "test-missing-pending-approval",
        name: "Missing Pending Approval Test",
        type: "multi_turn",
        turns: [
          {
            userMessage: "Approve missing confirmation",
            confirmPendingAction: true,
          },
        ],
        successCriteria: {},
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(false);
      expect(result.failures).toContainEqual(
        expect.objectContaining({
          criterion: "confirmPendingAction",
          actual: [],
        }),
      );
      expect(result.turnResults[0]?.assistantResponse).toContain(
        "cannot resolve approvalId",
      );
      expect(mockAgentService.confirmPendingAction).not.toHaveBeenCalled();
    });

    it("should fail the test instead of throwing when multiple pending approvals require an explicit id", async () => {
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

      const testCase: TestCase = {
        id: "test-ambiguous-pending-approval",
        name: "Ambiguous Pending Approval Test",
        type: "multi_turn",
        turns: [
          { userMessage: "Prepare update and delete" },
          {
            userMessage: "Approve one",
            confirmPendingAction: true,
          },
        ],
        successCriteria: {},
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(false);
      expect(result.failures).toContainEqual(
        expect.objectContaining({
          criterion: "confirmPendingAction",
          actual: ["approval:update", "approval:delete"],
        }),
      );
      expect(mockAgentService.confirmPendingAction).not.toHaveBeenCalled();
    });

    it("should use explicit eval permission when provided", async () => {
      const testCase: TestCase = {
        id: "test-explicit-admin",
        name: "Explicit Admin Permission Test",
        type: "tool_invocation",
        setup: { permissionLevel: "admin" },
        turns: [{ userMessage: "Hello" }],
        successCriteria: {},
      };

      await testRunner.runTest(testCase);

      const calls = mockAgentService.chat.mock.calls;
      expect(calls[0]?.[2]).toEqual({
        userPermissionLevel: "admin",
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

    it("should retain tool errors as judge evidence", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            text: "The peer call failed because its Agent Card was unavailable.",
            toolResults: [
              {
                toolName: "agent_call",
                args: { agent: "partner-brain.io" },
                error: {
                  message: "Agent Card was unavailable",
                  code: "agent_unreachable",
                },
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-tool-error-evidence",
        name: "Tool Error Evidence Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Call the saved peer" }],
        successCriteria: {
          expectedTools: [{ toolName: "agent_call", shouldBeCalled: true }],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
      expect(result.turnResults[0]?.toolCalls).toEqual([
        {
          toolName: "agent_call",
          args: { agent: "partner-brain.io" },
          result: {
            success: false,
            error: "Agent Card was unavailable",
            code: "agent_unreachable",
          },
        },
      ]);
    });

    it("should count pending confirmations as expected tool calls", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            text: "Confirmation required.",
            pendingConfirmations: [
              {
                id: "approval:create-note",
                toolName: "system_create",
                summary: "Create note?",
                args: {
                  entityType: "base",
                  content: "remember this",
                  confirmed: true,
                  confirmationToken: "runtime-token",
                },
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-pending-confirmation-tool-call",
        name: "Pending Confirmation Tool Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Save this as a note: remember this" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsContain: { entityType: "base" },
              argsAbsent: ["confirmed", "confirmationToken"],
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
      expect(result.totalMetrics.toolCallCount).toBe(1);
      expect(result.turnResults[0]?.toolCalls).toEqual([
        {
          toolName: "system_create",
          args: { entityType: "base", content: "remember this" },
          result: { needsConfirmation: true },
        },
      ]);
    });

    it("should preserve non-system confirmed args for eval criteria", async () => {
      mockAgentService.chat = mock(() =>
        Promise.resolve(
          createMockResponse({
            toolResults: [
              {
                toolName: "publishing_manage",
                args: {
                  action: "publish",
                  entityType: "post",
                  id: "post-1",
                  confirmed: true,
                },
                data: { success: true },
              },
            ],
          }),
        ),
      );

      const testCase: TestCase = {
        id: "test-non-system-confirmed-arg",
        name: "Non-system Confirmed Arg Test",
        type: "tool_invocation",
        turns: [{ userMessage: "Publish post-1" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "publishing_manage",
              shouldBeCalled: true,
              argsContain: { action: "publish", confirmed: true },
            },
          ],
        },
      };

      const result = await testRunner.runTest(testCase);

      expect(result.passed).toBe(true);
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
                args: {
                  entityType: "image",
                  source: { kind: "generate", prompt: "a landscape" },
                },
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
                args: {
                  entityType: "deck",
                  source: { kind: "text", content: "# Final deck" },
                },
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
