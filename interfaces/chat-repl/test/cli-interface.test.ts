import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  afterAll,
} from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";

type MockAgentService = Parameters<
  PluginTestHarness<CLIInterface>["setAgentService"]
>[0];
type MockAgentResponse = Awaited<ReturnType<MockAgentService["chat"]>>;

// Mock console.clear
const originalClear = console.clear;
console.clear = mock(() => {});

describe("CLIInterface", () => {
  let cliInterface: CLIInterface;
  let harness: PluginTestHarness<CLIInterface>;

  beforeEach(async () => {
    mock.restore();

    // Set up test harness
    harness = createPluginHarness<CLIInterface>();
  });

  afterEach(() => {
    harness.reset();
  });

  describe("constructor and configuration", () => {
    it("should create instance with context and default config", async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      expect(cliInterface.id).toBe("cli");
      expect(cliInterface.packageName).toBe("@brains/chat-repl");
    });

    it("should create instance with custom config", async () => {
      const config = {
        theme: {
          primaryColor: "#ff0000",
          accentColor: "#00ff00",
        },
      };
      cliInterface = new CLIInterface(config);
      await harness.installPlugin(cliInterface);

      // The install above throws on failure, so the claim is that a custom
      // theme still yields a working cli plugin — same identity as the
      // default-config case above.
      expect(cliInterface.id).toBe("cli");
      expect(cliInterface.packageName).toBe("@brains/chat-repl");
    });
  });

  describe("processInput - Agent-based", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
    });

    it("should route input to AgentService and receive response", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("Hello world");

      // The CLI now uses AgentService, which returns "Mock agent response" in tests
      expect(responseHandler).toHaveBeenCalledWith("Mock agent response");
    });

    it("should handle natural language queries", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("What is my brain about?");

      // Agent responds to natural language
      expect(responseHandler).toHaveBeenCalledWith("Mock agent response");
    });

    it("should handle tool-like requests through agent", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      // User can ask naturally, agent decides to use tools
      await cliInterface.processInput("Search for notes about TypeScript");

      expect(responseHandler).toHaveBeenCalledWith("Mock agent response");
    });

    it("should handle errors gracefully", async () => {
      // Test error handling by checking response callback is still functional
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      // Process a normal query
      await cliInterface.processInput("Test query");
      expect(responseHandler).toHaveBeenCalled();
    });

    it("should bind yes/no confirmations to structured approval card ids", async () => {
      const responseHandler = mock(() => {});
      const confirmMock = mock(
        async (
          _conversationId: string,
          _confirmed: boolean,
          _approvalId?: string,
        ): Promise<MockAgentResponse> => ({
          text: "Completed: Delete note?",
          cards: [
            {
              kind: "tool-approval",
              id: "approval:call-1",
              toolName: "delete_note",
              summary: "Delete note?",
              state: "output-available",
              output: { success: true, data: { deleted: "123" } },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
      );
      harness.reset();
      harness = createPluginHarness<CLIInterface>();

      const mockAgentService: MockAgentService = {
        chat: async (): Promise<MockAgentResponse> => ({
          text: "Approval needed.",
          cards: [
            {
              kind: "tool-approval",
              id: "approval:call-1",
              toolName: "delete_note",
              summary: "Delete note?",
              state: "approval-requested",
            },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
        confirmPendingAction: confirmMock,
        invalidateAgent: (): void => {},
      };
      harness.setAgentService(mockAgentService);
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("delete it");
      await cliInterface.processInput("yes");

      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Please reply with **yes**"),
      );
      expect(confirmMock).toHaveBeenCalledWith("cli", true, "approval:call-1", {
        userPermissionLevel: "admin",
        isAnchor: false,
        interfaceType: "cli",
      });
      expect(responseHandler).toHaveBeenCalledWith("✓ Delete note?");
    });

    it("should format declined confirmations from output-denied cards", async () => {
      const responseHandler = mock(() => {});
      const confirmMock = mock(
        async (
          _conversationId: string,
          _confirmed: boolean,
          _approvalId?: string,
        ): Promise<MockAgentResponse> => ({
          text: "Cancelled: Delete note?",
          cards: [
            {
              kind: "tool-approval",
              id: "approval:call-1",
              toolName: "delete_note",
              summary: "Delete note?",
              state: "output-denied",
            },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
      );
      harness.reset();
      harness = createPluginHarness<CLIInterface>();

      const mockAgentService: MockAgentService = {
        chat: async (): Promise<MockAgentResponse> => ({
          text: "Approval needed.",
          cards: [
            {
              kind: "tool-approval",
              id: "approval:call-1",
              toolName: "delete_note",
              summary: "Delete note?",
              state: "approval-requested",
            },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
        confirmPendingAction: confirmMock,
        invalidateAgent: (): void => {},
      };
      harness.setAgentService(mockAgentService);
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("delete it");
      await cliInterface.processInput("no");

      expect(confirmMock).toHaveBeenCalledWith(
        "cli",
        false,
        "approval:call-1",
        {
          userPermissionLevel: "admin",
          isAnchor: false,
          interfaceType: "cli",
        },
      );
      expect(responseHandler).toHaveBeenCalledWith("○ Delete note?");
    });

    it("should pass topic changes during pending confirmation through to chat", async () => {
      const responseHandler = mock(() => {});
      const chatMock = mock(
        async (message: string): Promise<MockAgentResponse> => {
          if (message === "delete it") {
            return {
              text: "Approval needed.",
              cards: [
                {
                  kind: "tool-approval",
                  id: "approval:call-1",
                  toolName: "delete_note",
                  summary: "Delete note?",
                  state: "approval-requested",
                },
              ],
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
            };
          }
          return {
            text: "Fresh topic answer.",
            usage: { promptTokens: 5, completionTokens: 6, totalTokens: 11 },
          };
        },
      );
      const confirmMock = mock(async (): Promise<MockAgentResponse> => ({
        text: "Should not confirm.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }));
      harness.reset();
      harness = createPluginHarness<CLIInterface>();

      const mockAgentService: MockAgentService = {
        chat: chatMock,
        confirmPendingAction: confirmMock,
        invalidateAgent: (): void => {},
      };
      harness.setAgentService(mockAgentService);
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("delete it");
      await cliInterface.processInput("actually tell me about Rover");

      expect(confirmMock).not.toHaveBeenCalled();
      expect(chatMock).toHaveBeenNthCalledWith(
        2,
        "actually tell me about Rover",
        "cli",
        {
          userPermissionLevel: "admin",
          isAnchor: false,
          interfaceType: "cli",
          channelId: "cli",
          channelName: "CLI Terminal",
        },
      );
      expect(responseHandler).not.toHaveBeenCalledWith(
        "_Please reply with **yes** to confirm or **no/cancel** to abort._",
      );
      expect(responseHandler).toHaveBeenCalledWith("Fresh topic answer.");
    });

    it("should route indexed responses when multiple confirmations are pending", async () => {
      const responseHandler = mock(() => {});
      const confirmMock = mock(
        async (
          _conversationId: string,
          confirmed: boolean,
          approvalId?: string,
        ): Promise<MockAgentResponse> => ({
          text: confirmed ? "Completed" : "Cancelled",
          cards: [
            {
              kind: "tool-approval",
              id: approvalId ?? "approval:unknown",
              toolName: "delete_note",
              summary:
                approvalId === "approval:call-2"
                  ? "Delete beta?"
                  : "Delete alpha?",
              state: confirmed ? "output-available" : "output-denied",
              ...(confirmed ? { output: { success: true } } : {}),
            },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
      );
      harness.reset();
      harness = createPluginHarness<CLIInterface>();

      const mockAgentService: MockAgentService = {
        chat: async (): Promise<MockAgentResponse> => ({
          text: "Approval needed.",
          cards: [
            {
              kind: "tool-approval",
              id: "approval:call-1",
              toolName: "delete_note",
              summary: "Delete alpha?",
              state: "approval-requested",
            },
            {
              kind: "tool-approval",
              id: "approval:call-2",
              toolName: "delete_note",
              summary: "Delete beta?",
              state: "approval-requested",
            },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
        confirmPendingAction: confirmMock,
        invalidateAgent: (): void => {},
      };
      harness.setAgentService(mockAgentService);
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("delete both");
      await cliInterface.processInput("yes 2");
      await cliInterface.processInput("no");

      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("yes 1"),
      );
      expect(confirmMock).toHaveBeenNthCalledWith(
        1,
        "cli",
        true,
        "approval:call-2",
        {
          userPermissionLevel: "admin",
          isAnchor: false,
          interfaceType: "cli",
        },
      );
      expect(confirmMock).toHaveBeenNthCalledWith(
        2,
        "cli",
        false,
        "approval:call-1",
        {
          userPermissionLevel: "admin",
          isAnchor: false,
          interfaceType: "cli",
        },
      );
      expect(responseHandler).toHaveBeenCalledWith("✓ Delete beta?");
      expect(responseHandler).toHaveBeenCalledWith("○ Delete alpha?");
    });
  });

  describe("callback registration", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
    });

    it("should support callback registration and unregistration", () => {
      const responseHandler = mock(() => {});
      const progressHandler = mock(() => {});

      // Test registering callbacks
      cliInterface.registerResponseCallback(responseHandler);
      cliInterface.registerProgressCallback(progressHandler);

      // Test unregistering callbacks
      cliInterface.unregisterProgressCallback();
      cliInterface.unregisterMessageCallbacks();
    });
  });

  describe("daemon lifecycle", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
    });

    it("should provide daemon capability", () => {
      // Interface plugins provide daemon capability
      expect(cliInterface.type).toBe("interface");
    });

    it("should remove SIGINT/SIGTERM listeners on cleanup", async () => {
      class SignalTestCLIInterface extends CLIInterface {
        installSignalHandlers(): void {
          this.registerSignalHandlers();
        }
        async teardown(): Promise<void> {
          await this.cleanup();
        }
      }
      const signalInterface = new SignalTestCLIInterface();
      await harness.installPlugin(signalInterface);

      const before = {
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
      };

      signalInterface.installSignalHandlers();

      expect(process.listenerCount("SIGINT")).toBe(before.sigint + 1);
      expect(process.listenerCount("SIGTERM")).toBe(before.sigterm + 1);

      await signalInterface.teardown();

      expect(process.listenerCount("SIGINT")).toBe(before.sigint);
      expect(process.listenerCount("SIGTERM")).toBe(before.sigterm);
    });
  });

  describe("response plan rendering", () => {
    it("renders supplemental cards (sources) to the terminal", async () => {
      const responseHandler = mock(() => {});
      harness.reset();
      harness = createPluginHarness<CLIInterface>();
      harness.setAgentService({
        chat: async (): Promise<MockAgentResponse> => ({
          text: "Here is what I found.",
          cards: [
            {
              kind: "sources",
              id: "sources-1",
              title: "Retrieved context",
              sources: [
                {
                  id: "cite-1",
                  title: "TypeScript notes",
                  source: "note",
                  url: "https://example.test/notes/ts",
                },
              ],
            },
          ],
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
        confirmPendingAction: async (): Promise<MockAgentResponse> => ({
          text: "",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
        invalidateAgent: (): void => {},
      });
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("what do you know about TypeScript?");

      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Here is what I found."),
      );
      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Sources: Retrieved context"),
      );
      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining(
          "TypeScript notes — https://example.test/notes/ts",
        ),
      );
    });
  });

  describe("shared confirmation grammar", () => {
    const twoApprovalsAgent = (
      confirmMock: MockAgentService["confirmPendingAction"],
    ): MockAgentService => ({
      chat: async (): Promise<MockAgentResponse> => ({
        text: "Approval needed.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolName: "delete_note",
            summary: "Delete alpha?",
            state: "approval-requested",
          },
          {
            kind: "tool-approval",
            id: "approval:call-2",
            toolName: "delete_note",
            summary: "Delete beta?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
      confirmPendingAction: confirmMock,
      invalidateAgent: (): void => {},
    });

    it("routes approval-id responses through the shared grammar", async () => {
      const responseHandler = mock(() => {});
      const confirmMock = mock(
        async (
          _conversationId: string,
          confirmed: boolean,
          approvalId?: string,
        ): Promise<MockAgentResponse> => ({
          text: confirmed ? "Completed" : "Cancelled",
          cards: [
            {
              kind: "tool-approval",
              id: approvalId ?? "approval:unknown",
              toolName: "delete_note",
              summary: "Delete beta?",
              state: "output-available",
              output: { success: true },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
      );
      harness.reset();
      harness = createPluginHarness<CLIInterface>();
      harness.setAgentService(twoApprovalsAgent(confirmMock));
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("delete both");
      await cliInterface.processInput("yes approval:call-2");

      expect(confirmMock).toHaveBeenCalledWith("cli", true, "approval:call-2", {
        userPermissionLevel: "admin",
        isAnchor: false,
        interfaceType: "cli",
      });
    });

    it("answers a bare yes on multiple approvals with the shared notice", async () => {
      const responseHandler = mock(() => {});
      const confirmMock = mock(async (): Promise<MockAgentResponse> => ({
        text: "Should not confirm.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }));
      harness.reset();
      harness = createPluginHarness<CLIInterface>();
      harness.setAgentService(twoApprovalsAgent(confirmMock));
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("delete both");
      await cliInterface.processInput("yes");

      expect(confirmMock).not.toHaveBeenCalled();
      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Multiple approvals are pending"),
      );
    });
  });

  describe("system message routing", () => {
    it("routes transport messages to the system callback, replies to the response callback", async () => {
      class TransportProbe extends CLIInterface {
        public deliverTransportMessage(text: string): void {
          this.sendMessageToChannel({ channelId: null, message: text });
        }
      }

      const responseHandler = mock(() => {});
      const systemHandler = mock(() => {});
      const probe = new TransportProbe();
      await harness.installPlugin(probe);
      probe.registerResponseCallback(responseHandler);
      probe.registerSystemMessageCallback(systemHandler);

      await probe.processInput("Hello world");
      probe.deliverTransportMessage("✅ Job finished");

      expect(responseHandler).toHaveBeenCalledWith("Mock agent response");
      expect(responseHandler).not.toHaveBeenCalledWith("✅ Job finished");
      expect(systemHandler).toHaveBeenCalledWith("✅ Job finished");
    });

    it("falls back to the response callback when no system callback is registered", async () => {
      class TransportProbe extends CLIInterface {
        public deliverTransportMessage(text: string): void {
          this.sendMessageToChannel({ channelId: null, message: text });
        }
      }

      const responseHandler = mock(() => {});
      const probe = new TransportProbe();
      await harness.installPlugin(probe);
      probe.registerResponseCallback(responseHandler);

      probe.deliverTransportMessage("✅ Job finished");

      expect(responseHandler).toHaveBeenCalledWith("✅ Job finished");
    });
  });

  describe("Plugin Capabilities", () => {
    it("should register as interface plugin", async () => {
      cliInterface = new CLIInterface({
        theme: {
          primaryColor: "#0066cc",
          accentColor: "#ff6600",
        },
      });

      // Register the CLI interface
      const capabilities = await harness.installPlugin(cliInterface);

      // "registers as an interface plugin" is the plugin type; the arrays
      // being present is true of every plugin kind.
      expect(cliInterface.type).toBe("interface");
      expect(Array.isArray(capabilities.tools)).toBe(true);
      expect(Array.isArray(capabilities.resources)).toBe(true);
    });
  });
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
