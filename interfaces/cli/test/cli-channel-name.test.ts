import { describe, it, expect, beforeEach, mock } from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import { createInterfacePluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";

describe("CLI Interface - Channel Name Integration", () => {
  let cliInterface: CLIInterface;
  let harness: PluginTestHarness<CLIInterface>;
  let startConversationMock: ReturnType<typeof mock>;

  beforeEach(async () => {
    harness = createInterfacePluginHarness<CLIInterface>();
    cliInterface = new CLIInterface();

    // Mock the conversation service's startConversation method
    startConversationMock = mock().mockResolvedValue("test-conversation-id");
    const mockShell = harness.getShell();
    const originalGetConversationService =
      mockShell.getConversationService.bind(mockShell);
    mockShell.getConversationService = (): ReturnType<
      typeof originalGetConversationService
    > => {
      const service = originalGetConversationService();
      service.startConversation = startConversationMock;
      return service;
    };

    await harness.installPlugin(cliInterface);
  });

  it("should pass 'CLI Terminal' as channel name when starting conversations", async () => {
    // Process input which should trigger conversation start
    await cliInterface.processInput("Hello world");

    // Verify startConversation was called with 'CLI Terminal' as the channel name
    expect(startConversationMock).toHaveBeenCalled();
    const call = startConversationMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("No call found");

    // The metadata parameter should contain channelName: "CLI Terminal"
    const metadata = call[3]; // Fourth parameter is metadata
    expect(metadata).toBeDefined();
    expect(metadata.channelName).toBe("CLI Terminal");
  });

  it("should only start conversation once per session", async () => {
    // Process multiple inputs
    await cliInterface.processInput("First message");
    await cliInterface.processInput("Second message");
    await cliInterface.processInput("Third message");

    // Should only call startConversation once
    expect(startConversationMock).toHaveBeenCalledTimes(1);
  });
});
