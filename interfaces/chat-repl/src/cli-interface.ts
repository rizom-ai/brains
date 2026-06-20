import {
  MessageInterfacePlugin,
  type InterfacePluginContext,
  PluginError,
  parseConfirmationResponse,
  type StructuredChatCard,
  type ToolApprovalCard,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/plugins";
import type { JobProgressEvent } from "@brains/plugins";
import type { AgentNamespace } from "@brains/plugins";
import type { Instance } from "ink";
import { cliConfigSchema, type CLIConfig, type CLIConfigInput } from "./config";
import packageJson from "../package.json";

/**
 * CLI Interface - Agent-based architecture
 *
 * This interface:
 * - Routes ALL messages to AgentService (no command parsing)
 * - Uses AI agent for natural language interaction
 * - Extends MessageInterfacePlugin for common progress handling
 * - Keeps local UI commands (/exit, /clear, /progress) for CLI-specific controls
 */
export class CLIInterface extends MessageInterfacePlugin<
  CLIConfig,
  CLIConfigInput
> {
  declare protected config: CLIConfig;
  private inkApp: Instance | null = null;
  private responseCallback: ((response: string) => void) | undefined;
  private agentService?: AgentNamespace;

  // Track pending confirmation approval ids
  private pendingConfirmationIds: string[] = [];

  constructor(config: CLIConfigInput = {}) {
    super("cli", packageJson, config, cliConfigSchema);
  }

  /**
   * Get AgentService, throwing if not initialized
   */
  private getAgentService(): AgentNamespace {
    if (!this.agentService) {
      throw new Error("AgentService not initialized - plugin not registered");
    }
    return this.agentService;
  }

  /**
   * Register handlers and other initialization when plugin is registered
   */
  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    // Call parent to setup progress subscription
    await super.onRegister(context);

    // Get AgentService from context
    this.agentService = context.agent;

    this.logger.debug("CLI interface registered with AgentService");
  }

  /**
   * Send message to channel - implements abstract method from MessageInterfacePlugin
   * CLI has a single implicit channel, so channelId is ignored
   */
  protected override sendMessageToChannel({
    message,
  }: {
    channelId: string | null;
    message: string;
  }): void {
    if (this.responseCallback) {
      this.responseCallback(message);
    }
  }

  /**
   * Register callback to receive response events
   */
  public registerResponseCallback(callback: (response: string) => void): void {
    this.responseCallback = callback;
  }

  /**
   * Unregister response callbacks
   */
  public unregisterMessageCallbacks(): void {
    this.responseCallback = undefined;
  }

  /**
   * Custom progress update handling for CLI-specific UI updates
   */
  protected override async onProgressUpdate(
    event: JobProgressEvent,
  ): Promise<void> {
    // Log for debugging
    this.logger.debug("CLI progress update", {
      eventId: event.id,
      status: event.status,
      progress: event.progress,
      message: event.message,
    });
  }

  /**
   * Create daemon for managing CLI lifecycle
   */
  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        if (!this.context) {
          throw new PluginError(
            this.id,
            "Initialization failed: Plugin context not initialized",
          );
        }
        this.logger.debug("Starting CLI interface");

        try {
          // Use dynamic imports to ensure React isolation
          const [inkModule, reactModule, appModule] = await Promise.all([
            import("ink"),
            import("react"),
            import("./components/EnhancedApp"),
          ]);

          const { render } = inkModule;
          const React = reactModule.default;
          const App = appModule.default;

          // Ensure we're using React's createElement, not any bundled version
          const element = React.createElement(App, {
            interface: this,
            registerProgressCallback: (callback) =>
              this.registerProgressCallback(callback),
            unregisterProgressCallback: () => this.unregisterProgressCallback(),
            registerResponseCallback: (callback) =>
              this.registerResponseCallback(callback),
            unregisterMessageCallbacks: () => this.unregisterMessageCallbacks(),
          });
          this.inkApp = render(element);

          // Handle process termination gracefully
          process.on("SIGINT", async (): Promise<void> => {
            this.logger.debug("Received SIGINT, stopping CLI interface");
            await this.cleanup();
          });
          process.on("SIGTERM", async (): Promise<void> => {
            this.logger.debug("Received SIGTERM, stopping CLI interface");
            await this.cleanup();
          });
        } catch (error) {
          this.logger.error("Failed to start CLI interface", { error });
          throw error;
        }
      },
      stop: async (): Promise<void> => {
        this.logger.debug("Stopping CLI interface");
        await this.cleanup();
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const isRunning = this.inkApp !== null;
        return {
          status: isRunning ? "healthy" : "error",
          message: isRunning
            ? "CLI interface is running"
            : "CLI interface not running",
          lastCheck: new Date(),
          details: {
            hasInkApp: this.inkApp !== null,
            hasCallbacks: this.progressCallback !== undefined,
          },
        };
      },
    };
  }

  /**
   * Process user input - public API for UI components
   * Routes all input to AgentService for natural language processing
   */
  public async processInput(input: string): Promise<void> {
    const conversationId = "cli"; // Single conversation for CLI

    // Start processing - buffers completion messages until agent responds
    this.startProcessingInput();

    try {
      // Check for confirmation response
      if (this.pendingConfirmationIds.length > 0) {
        await this.handleConfirmationResponse(input, conversationId);
        return;
      }

      // Route message to AgentService with anchor permissions (CLI is local)
      const response = await this.getAgentService().chat(
        input,
        conversationId,
        {
          userPermissionLevel: "anchor",
          interfaceType: "cli",
          channelId: "cli",
          channelName: "CLI Terminal",
        },
      );

      // Track pending confirmations if returned
      const approvalCards = this.getPendingApprovalCards(response.cards);
      if (approvalCards.length > 0) {
        this.pendingConfirmationIds = approvalCards.map((card) => card.id);
      } else if (response.pendingConfirmations) {
        this.pendingConfirmationIds = response.pendingConfirmations.map(
          (confirmation) => confirmation.id,
        );
      }

      // Build response with tool results
      const responseText = this.formatAgentResponseText(
        response.text,
        approvalCards,
      );

      // Debug: log tool results
      this.logger.debug("Agent response received", {
        textLength: response.text.length,
        toolResultsCount: response.toolResults?.length ?? 0,
        toolResults: response.toolResults?.map((tr) => ({
          toolName: tr.toolName,
          hasData: tr.data !== undefined,
        })),
      });

      // Send response to UI
      // Note: Tool formatted outputs are available to the agent but not auto-appended
      // The agent should summarize tool results in its response
      this.sendMessageToChannel({
        channelId: null,
        message: responseText,
      });
    } catch (error) {
      this.logger.error("Error processing input", { error, input });
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      this.sendMessageToChannel({
        channelId: null,
        message: `**Error:** ${errorMessage}`,
      });
    } finally {
      // End processing - flushes any buffered completion messages
      this.endProcessingInput();
    }
  }

  /**
   * Get pending approval card from structured agent response cards.
   */
  private getPendingApprovalCards(
    cards: StructuredChatCard[] | undefined,
  ): ToolApprovalCard[] {
    return (
      cards?.filter(
        (card): card is ToolApprovalCard =>
          card.kind === "tool-approval" && card.state === "approval-requested",
      ) ?? []
    );
  }

  private getResolvedApprovalCard(
    cards: StructuredChatCard[] | undefined,
  ): ToolApprovalCard | undefined {
    return cards?.find(
      (card): card is ToolApprovalCard =>
        card.kind === "tool-approval" &&
        (card.state === "output-available" ||
          card.state === "output-error" ||
          card.state === "output-denied"),
    );
  }

  /**
   * Format CLI response text for structured approval cards.
   */
  private formatAgentResponseText(
    text: string,
    approvalCards: ToolApprovalCard[],
  ): string {
    if (approvalCards.length === 0) return text;

    if (approvalCards.length === 1) {
      const approvalCard = approvalCards[0];
      if (!approvalCard) return text;
      const baseText = text.trim().length > 0 ? text : approvalCard.summary;
      const preview = approvalCard.preview ? `\n\n${approvalCard.preview}` : "";
      return `${baseText}${preview}\n\n_Please reply with **yes** to confirm or **no/cancel** to abort._`;
    }

    const baseText =
      text.trim().length > 0 ? text : "Multiple approvals required.";
    const approvalList = approvalCards
      .map((card, index) => {
        const preview = card.preview ? `\n   ${card.preview}` : "";
        return `${index + 1}. ${card.summary}${preview}`;
      })
      .join("\n");
    return `${baseText}\n\n${approvalList}\n\n_Please reply with **yes 1** / **no 1** for the matching action._`;
  }

  private formatApprovalResultText(
    text: string,
    cards: StructuredChatCard[] | undefined,
  ): string {
    const resultCard = this.getResolvedApprovalCard(cards);
    if (!resultCard) return text;

    if (resultCard.state === "output-error") {
      return resultCard.error
        ? `✗ ${resultCard.summary}\n\n${resultCard.error}`
        : `✗ ${resultCard.summary}`;
    }
    if (resultCard.state === "output-denied") {
      return `○ ${resultCard.summary}`;
    }
    return `✓ ${resultCard.summary}`;
  }

  private parseIndexedConfirmationResponse(
    message: string,
  ): { confirmed: boolean; index?: number } | undefined {
    const match = /^(.*?)(?:\s+#?(\d+))?$/.exec(message.trim());
    const responseText = match?.[1]?.trim() ?? message.trim();
    const parsed = parseConfirmationResponse(responseText);
    if (!parsed) return undefined;

    const indexText = match?.[2];
    if (!indexText) return { confirmed: parsed.confirmed };

    return { confirmed: parsed.confirmed, index: Number(indexText) - 1 };
  }

  private getConfirmationHelpText(): string {
    if (this.pendingConfirmationIds.length > 1) {
      return "_Please reply with **yes 1** / **no 1** for the matching action._";
    }
    return "_Please reply with **yes** to confirm or **no/cancel** to abort._";
  }

  private resolvePendingApprovalSelection(
    message: string,
  ): { confirmed: boolean; approvalId: string } | undefined {
    const result = this.parseIndexedConfirmationResponse(message);
    if (result === undefined) {
      this.sendMessageToChannel({
        channelId: null,
        message: this.getConfirmationHelpText(),
      });
      return undefined;
    }

    if (this.pendingConfirmationIds.length > 1 && result.index === undefined) {
      this.sendMessageToChannel({
        channelId: null,
        message:
          "_Multiple approvals are pending. Reply with **yes 1** / **no 1** for the matching action._",
      });
      return undefined;
    }

    const selectedIndex = result.index ?? 0;
    const approvalId = this.pendingConfirmationIds[selectedIndex];
    if (!approvalId) {
      this.sendMessageToChannel({
        channelId: null,
        message: this.getConfirmationHelpText(),
      });
      return undefined;
    }

    return { confirmed: result.confirmed, approvalId };
  }

  /**
   * Handle confirmation responses (yes/no)
   */
  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
  ): Promise<void> {
    const approvalSelection = this.resolvePendingApprovalSelection(message);
    if (!approvalSelection) return;

    // Clear selected pending confirmation before calling AgentService.
    this.pendingConfirmationIds = this.pendingConfirmationIds.filter(
      (id) => id !== approvalSelection.approvalId,
    );

    // Call AgentService to confirm or cancel
    const response = await this.getAgentService().confirmPendingAction(
      conversationId,
      approvalSelection.confirmed,
      approvalSelection.approvalId,
      {
        userPermissionLevel: "anchor",
        interfaceType: "cli",
      },
    );

    // Send response to UI
    this.sendMessageToChannel({
      channelId: null,
      message: this.formatApprovalResultText(response.text, response.cards),
    });
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    // Clean up callbacks
    this.unregisterProgressCallback();
    this.unregisterMessageCallbacks();

    if (this.inkApp) {
      this.inkApp.unmount();
      this.inkApp = null;
    }
  }
}
