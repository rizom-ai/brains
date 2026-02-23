import { describe, it, expect, beforeEach, mock } from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type {
  IAgentService,
  AgentResponse,
  ChatContext,
} from "@brains/plugins";

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
      ): Promise<AgentResponse> => ({
        text: "Mock response",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
    );

    const mockAgentService: IAgentService = {
      chat: chatMock,
      confirmPendingAction: async (): Promise<AgentResponse> => ({
        text: "Confirmed",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
    };

    // Inject the mock agent service
    const mockShell = harness.getShell();
    mockShell.getAgentService = (): IAgentService => mockAgentService;

    await harness.installPlugin(cliInterface);
  });

  it("should pass 'CLI Terminal' as channel name when chatting with agent", async () => {
    // Process input which should call agent
    await cliInterface.processInput("Hello world");

    // Verify chat was called
    expect(chatMock).toHaveBeenCalled();
    const call = chatMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("No call found");

    // Verify the context parameter contains channelName: "CLI Terminal"
    const [message, conversationId, context] = call as [
      string,
      string,
      ChatContext,
    ];
    expect(message).toBe("Hello world");
    expect(conversationId).toBe("cli");
    expect(context).toBeDefined();
    expect(context.channelName).toBe("CLI Terminal");
    expect(context.interfaceType).toBe("cli");
    expect(context.userPermissionLevel).toBe("anchor");
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
