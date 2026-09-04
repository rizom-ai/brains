import { describe, it, expect, beforeEach, mock } from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { ChatContext } from "@brains/plugins";

type MockAgentService = Parameters<
  PluginTestHarness<CLIInterface>["setAgentService"]
>[0];
type MockAgentResponse = Awaited<ReturnType<MockAgentService["chat"]>>;

describe("CLI Interface - Agent Context Integration", () => {
  let cliInterface: CLIInterface;
  let harness: PluginTestHarness<CLIInterface>;
  let chatMock: ReturnType<typeof mock>;

  beforeEach(async () => {
    harness = createPluginHarness<CLIInterface>();
    cliInterface = new CLIInterface();

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
    await harness.installPlugin(cliInterface);
  });

  it("should pass 'CLI Terminal' as channel name when chatting with agent", async () => {
    // Process input which should call agent
    await cliInterface.processInput("Hello world");

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

  it("should use same conversation ID for all messages in session", async () => {
    // Process multiple inputs
    await cliInterface.processInput("First message");
    await cliInterface.processInput("Second message");
    await cliInterface.processInput("Third message");

    // All calls should use the same conversation ID
    expect(chatMock).toHaveBeenCalledTimes(3);

    const conversationIds = chatMock.mock.calls.map(
      (call: unknown[]) => call[1],
    );
    expect(conversationIds).toEqual(["cli", "cli", "cli"]);
  });
});
