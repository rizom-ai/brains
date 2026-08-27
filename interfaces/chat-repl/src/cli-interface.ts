import {
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
  PendingApprovalTracker,
  PluginError,
  buildApprovalResultView,
  buildResponsePlan,
  formatApprovalRequestText,
  formatStructuredCardFallback,
  getPendingApprovalCards,
  getResolvedApprovalCard,
  parseConfirmationIntent,
  routeConfirmationResponse,
  type AgentResponse,
  type ApprovalResolution,
  type SendMessageToChannelRequest,
  type StructuredChatCard,
  type ToolApprovalCard,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/plugins";
import type { JobProgressEvent } from "@brains/plugins";
import type { AgentNamespace } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { addProcessSignalListeners } from "@brains/utils/process-signals";
import type { Instance } from "ink";
import { cliConfigSchema, type CLIConfig, type CLIConfigInput } from "./config";
import packageJson from "../package.json";

const APPROVAL_RESULT_MARKERS: Record<ApprovalResolution, string> = {
  completed: "✓",
  declined: "○",
  failed: "✗",
};

/**
 * The terminal shows URLs as-is and hides nothing; permission filtering
 * happened upstream (the CLI runs as the local administrator).
 */
const CARD_FALLBACK_OPTIONS = {
  deniedCardIds: undefined,
  resolveUrl: (url: string | undefined): string | undefined => url,
  isHiddenUrl: (): boolean => false,
  eventActionUnavailableLabel: undefined,
};

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
  private systemMessageCallback: ((message: string) => void) | undefined;
  private agentService?: AgentNamespace;
  private removeSignalHandlers: (() => void) | undefined;

  // Tracks pending confirmation approval ids; restores them from stored
  // conversation messages so approvals survive a process restart.
  private approvalTracker: PendingApprovalTracker | undefined;

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
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    // Call parent to setup progress subscription
    await super.onRegister(context);

    // Get AgentService from context
    this.agentService = context.agent;

    this.logger.debug("CLI interface registered with AgentService");
  }

  /**
   * Transport for messages the base coordinator initiates — job progress and
   * completion updates. Replies to user input go through sendReply instead,
   * so the UI can tell job updates from conversation without inspecting the
   * rendered text. CLI has a single implicit channel, so channelId is ignored.
   */
  protected override sendMessageToChannel({
    message,
  }: SendMessageToChannelRequest): void {
    const text =
      typeof message === "string" ? message : (message.fallbackText ?? "");
    if (!text) return;
    const deliver = this.systemMessageCallback ?? this.responseCallback;
    deliver?.(text);
  }

  /**
   * Deliver a reply to the user's own input (agent responses, confirmation
   * results, notices, errors).
   */
  private sendReply(message: string): void {
    this.responseCallback?.(message);
  }

  /**
   * Register callback to receive response events
   */
  public registerResponseCallback(callback: (response: string) => void): void {
    this.responseCallback = callback;
  }

  /**
   * Register callback for coordinator-initiated messages (job progress and
   * completion updates), letting the UI coalesce them instead of treating
   * them as conversation.
   */
  public registerSystemMessageCallback(
    callback: (message: string) => void,
  ): void {
    this.systemMessageCallback = callback;
  }

  /**
   * Unregister response callbacks
   */
  public unregisterMessageCallbacks(): void {
    this.responseCallback = undefined;
    this.systemMessageCallback = undefined;
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
            registerSystemMessageCallback: (callback) =>
              this.registerSystemMessageCallback(callback),
            unregisterMessageCallbacks: () => this.unregisterMessageCallbacks(),
          });
          this.inkApp = render(element);

          this.registerSignalHandlers();
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
            hasCallbacks: this.hasProgressCallback(),
          },
        };
      },
    };
  }

  private getApprovalTracker(): PendingApprovalTracker {
    this.approvalTracker ??= new PendingApprovalTracker({
      loadMessages: async (
        conversationId: string,
      ): Promise<readonly unknown[]> =>
        (await this.context?.conversations.getMessages(conversationId, {
          limit: 50,
        })) ?? [],
      onRestoreError: (error, conversationId): void => {
        this.logger.debug("Failed to restore pending CLI approvals", {
          error,
          conversationId,
        });
      },
    });
    return this.approvalTracker;
  }

  private async getPendingApprovalIds(
    conversationId: string,
  ): Promise<string[]> {
    return [
      ...(await this.getApprovalTracker().getApprovalIds(conversationId)),
    ];
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
      // Check for explicit confirmation responses. Other messages should fall
      // through to AgentService; it applies the authoritative implicit-decline
      // semantics for mid-confirmation topic changes.
      const pendingApprovalIds =
        await this.getPendingApprovalIds(conversationId);
      if (pendingApprovalIds.length > 0) {
        const handledConfirmation = await this.handleConfirmationResponse(
          input,
          conversationId,
          pendingApprovalIds,
        );
        if (handledConfirmation) return;
      }

      // Route message to AgentService with administrator permissions (CLI is local).
      const response = await this.getAgentService().chat(
        input,
        conversationId,
        {
          userPermissionLevel: "admin",
          isAnchor: this.getContext().permissions.isAnchor("cli", "local"),
          interfaceType: "cli",
          channelId: "cli",
          channelName: "CLI Terminal",
        },
      );

      // Track pending confirmations if returned
      const approvalCards = getPendingApprovalCards(response.cards);
      const nextApprovalIds =
        approvalCards.length > 0
          ? approvalCards.map((card) => card.id)
          : (response.pendingConfirmations?.map(
              (confirmation) => confirmation.id,
            ) ?? []);
      this.getApprovalTracker().replaceApprovals(
        conversationId,
        nextApprovalIds,
      );

      // Render the full response plan: text, approval prompts, and the
      // sources/actions/artifact cards other interfaces already show.
      const responseText = this.renderAgentResponse(response);

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
      this.sendReply(responseText);
    } catch (error) {
      this.logger.error("Error processing input", { error, input });
      const errorMessage = getErrorMessage(error, "An unknown error occurred");
      this.sendReply(`**Error:** ${errorMessage}`);
    } finally {
      // End processing - flushes any buffered completion messages
      this.endProcessingInput();
    }
  }

  /**
   * Render an agent response for the terminal from the shared response plan.
   *
   * Approval-requested cards are gathered from both the plan's approvals
   * directive and the supplemental stream (the plan only emits the approvals
   * directive when the response carries pending confirmations; the CLI also
   * treats bare approval-requested cards as confirmations), then rendered
   * with the terminal's reply instructions. Every other card renders through
   * the shared text fallback, so sources, actions, and artifacts reach the
   * terminal instead of being dropped.
   */
  private renderAgentResponse(
    response: Pick<
      AgentResponse,
      "text" | "cards" | "pendingConfirmations" | "toolResults"
    >,
  ): string {
    const plan = buildResponsePlan(response, { deniedCardIds: undefined });
    const approvalCards: ToolApprovalCard[] = [];
    const cardBlocks: string[] = [];
    let text = "";

    for (const directive of plan.directives) {
      switch (directive.kind) {
        case "text":
          text = directive.text;
          break;
        case "approvals":
          approvalCards.push(...directive.cards);
          break;
        default:
          if (
            directive.card.kind === "tool-approval" &&
            directive.card.state === "approval-requested"
          ) {
            approvalCards.push(directive.card);
            break;
          }
          cardBlocks.push(
            formatStructuredCardFallback(directive.card, CARD_FALLBACK_OPTIONS),
          );
      }
    }

    return [this.formatAgentResponseText(text, approvalCards), ...cardBlocks]
      .filter((section) => section.trim().length > 0)
      .join("\n\n");
  }

  /**
   * Format CLI response text for structured approval cards: the shared base
   * text plus terminal-specific previews and reply instructions.
   */
  private formatAgentResponseText(
    text: string,
    approvalCards: ToolApprovalCard[],
  ): string {
    if (approvalCards.length === 0) return text;
    const baseText = formatApprovalRequestText(text, approvalCards);

    if (approvalCards.length === 1) {
      const approvalCard = approvalCards[0];
      if (!approvalCard) return text;
      const preview = approvalCard.preview ? `\n\n${approvalCard.preview}` : "";
      return `${baseText}${preview}\n\n_Please reply with **yes** to confirm or **no/cancel** to abort._`;
    }

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
    const resultCard = getResolvedApprovalCard(cards);
    if (!resultCard) return text;

    const result = buildApprovalResultView(resultCard);
    const marker = APPROVAL_RESULT_MARKERS[result.resolution];
    return result.error
      ? `${marker} ${result.summary}\n\n${result.error}`
      : `${marker} ${result.summary}`;
  }

  /**
   * Terminal sugar: `yes 2` / `no #1` selects the nth pending approval. The
   * index lowers into the approval id before the shared grammar routes the
   * message, so all confirmation semantics — ambiguity notices, unknown-id
   * handling, single-approval fallback — live in one place across interfaces.
   */
  private resolveApprovalIndexSugar(
    message: string,
    pendingApprovalIds: string[],
  ): string {
    const match = /^(.*?)\s+#?(\d+)$/.exec(message.trim());
    if (!match?.[1] || !match[2]) return message;
    const approvalId = pendingApprovalIds[Number(match[2]) - 1];
    return approvalId ? `${match[1]} ${approvalId}` : message;
  }

  /**
   * Handle confirmation responses (yes/no) through the shared grammar.
   * Returns false for non-confirmation input so topic changes fall through
   * to AgentService, which owns the implicit-decline semantics.
   */
  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    pendingApprovalIds: string[],
  ): Promise<boolean> {
    const approvalIds = new Set(pendingApprovalIds);
    if (!parseConfirmationIntent(message, approvalIds)) return false;

    const routed = routeConfirmationResponse({
      message: this.resolveApprovalIndexSugar(message, pendingApprovalIds),
      approvalIds,
    });
    if (routed.kind === "not-confirmation") return false;
    if (routed.kind === "notice") {
      this.sendReply(`_${routed.message}_`);
      return true;
    }

    // Clear selected pending confirmation before calling AgentService.
    this.getApprovalTracker().removeApproval(conversationId, routed.approvalId);

    // Call AgentService to confirm or cancel
    const response = await this.getAgentService().confirmPendingAction(
      conversationId,
      routed.confirmed,
      routed.approvalId,
      {
        userPermissionLevel: "admin",
        isAnchor: this.getContext().permissions.isAnchor("cli", "local"),
        interfaceType: "cli",
      },
    );
    this.getApprovalTracker().syncFromResponse(
      conversationId,
      response,
      routed.approvalId,
    );

    // Send response to UI
    this.sendReply(
      this.formatApprovalResultText(response.text, response.cards),
    );
    return true;
  }

  /**
   * Handle process termination gracefully. The handler is stored so it can
   * be removed on stop — otherwise a listener leaks per daemon start and
   * Node warns about exceeding the max listener count.
   */
  protected registerSignalHandlers(): void {
    const signalHandler = (): void => {
      this.logger.debug("Received termination signal, stopping CLI");
      void this.cleanup();
    };
    this.removeSignalHandlers = addProcessSignalListeners(
      ["SIGINT", "SIGTERM"],
      signalHandler,
    );
  }

  /**
   * Clean up resources
   */
  protected async cleanup(): Promise<void> {
    // Clean up callbacks
    this.unregisterProgressCallback();
    this.unregisterMessageCallbacks();

    this.removeSignalHandlers?.();
    this.removeSignalHandlers = undefined;

    if (this.inkApp) {
      this.inkApp.unmount();
      this.inkApp = null;
    }
  }
}
