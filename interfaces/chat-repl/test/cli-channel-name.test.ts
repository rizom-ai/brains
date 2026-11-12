import { describe, it, expect, beforeEach, mock } from "bun:test";
import { startTerminal, type Terminal } from "./terminal";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { ChatContext } from "@brains/plugins";
import { createExternalActorId } from "@brains/contracts";

type MockAgentService = Parameters<PluginTestHarness["setAgentService"]>[0];
type MockAgentResponse = Awaited<ReturnType<MockAgentService["chat"]>>;

describe("CLI Interface - Agent Context Integration", () => {
  let terminal: Terminal;
  let harness: PluginTestHarness;
  let chatMock: ReturnType<typeof mock>;

  beforeEach(async () => {
    harness = createPluginHarness();

    // Create a mock AgentService to capture the chat context
    chatMock = mock().mockImplementation(
      async (
        _message: string,
        _conversationId: string,
        _context?: ChatContext,
      ): Promise<MockAgentResponse> => ({
        text: "Mock response",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
    );

    const mockAgentService: MockAgentService = {
      chat: chatMock,
      confirmPendingAction: async (): Promise<MockAgentResponse> => ({
        text: "Confirmed",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
      invalidateAgent: (): void => {},
    };

    harness.setAgentService(mockAgentService);
    terminal = await startTerminal(harness);
  });

  it("should pass 'CLI Terminal' as channel name when chatting with agent", async () => {
    // Process input which should call agent
    await terminal.processInput("Hello world");

    // What the CLI hands the agent service is the contract under test.
    expect(chatMock).toHaveBeenCalledWith(
      "Hello world",
      "cli",
      expect.objectContaining({
        channelName: "CLI Terminal",
        interfaceType: "cli",
        userPermissionLevel: "admin",
      }),
    );
  });

  it("names the operator at the terminal as the speaker", async () => {
    await terminal.processInput("Hello world");

    // Without a speaker, work the turn queues runs as the brain's own agent,
    // at no grant of its own, and a post's generation is refused.
    expect(chatMock).toHaveBeenCalledWith(
      "Hello world",
      "cli",
      expect.objectContaining({
        actor: {
          identity: {
            kind: "external",
            externalActorId: createExternalActorId("cli", "operator"),
          },
          interfaceType: "cli",
          role: "user",
        },
      }),
    );
  });

  it("should use same conversation ID for all messages in session", async () => {
    // Process multiple inputs
    await terminal.processInput("First message");
    await terminal.processInput("Second message");
    await terminal.processInput("Third message");

    // All calls should use the same conversation ID
    expect(chatMock).toHaveBeenCalledTimes(3);

    const conversationIds = chatMock.mock.calls.map(
      (call: unknown[]) => call[1],
    );
    expect(conversationIds).toEqual(["cli", "cli", "cli"]);
  });
});
