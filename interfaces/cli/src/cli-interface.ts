import {
  MessageInterfacePlugin,
  type InterfacePluginContext,
  PluginError,
  parseConfirmationResponse,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/daemon-registry";
import type { JobProgressEvent } from "@brains/plugins";
import type { IAgentService } from "@brains/agent-service";
import type { Instance } from "ink";
import { cliConfigSchema, type CLIConfig } from "./config";
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
export class CLIInterface extends MessageInterfacePlugin<CLIConfig> {
  declare protected config: CLIConfig;
  private inkApp: Instance | null = null;
  private responseCallback: ((response: string) => void) | undefined;
  private agentService?: IAgentService;

  // Track pending confirmations
  private pendingConfirmation = false;

  constructor(config: Partial<CLIConfig> = {}) {
    super("cli", packageJson, config, cliConfigSchema);
  }

  /**
   * Get AgentService, throwing if not initialized
   */
  private getAgentService(): IAgentService {
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
    this.agentService = context.agentService;

    this.logger.debug("CLI interface registered with AgentService");
  }

  /**
   * Send message to channel - implements abstract method from MessageInterfacePlugin
   * CLI has a single implicit channel, so channelId is ignored
   */
  protected override sendMessageToChannel(
    _channelId: string | null,
    message: string,
  ): void {
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
      if (this.pendingConfirmation) {
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

      // Track pending confirmation if returned
      if (response.pendingConfirmation) {
        this.pendingConfirmation = true;
      }

      // Build response with tool results
      const responseText = response.text;

      // Debug: log tool results
      this.logger.debug("Agent response received", {
        textLength: response.text.length,
        toolResultsCount: response.toolResults?.length ?? 0,
        toolResults: response.toolResults?.map((tr) => ({
          toolName: tr.toolName,
          formattedLength: tr.formatted?.length ?? 0,
        })),
      });

      // Send response to UI
      // Note: Tool formatted outputs are available to the agent but not auto-appended
      // The agent should summarize tool results in its response
      this.sendMessageToChannel(null, responseText);
    } catch (error) {
      this.logger.error("Error processing input", { error, input });
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      this.sendMessageToChannel(null, `**Error:** ${errorMessage}`);
    } finally {
      // End processing - flushes any buffered completion messages
      this.endProcessingInput();
    }
  }

  /**
   * Handle confirmation responses (yes/no)
   */
  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
  ): Promise<void> {
    const result = parseConfirmationResponse(message);

    // Unrecognized response - show help
    if (result === undefined) {
      this.sendMessageToChannel(
        null,
        "_Please reply with **yes** to confirm or **no/cancel** to abort._",
      );
      return;
    }

    // Clear pending confirmation
    this.pendingConfirmation = false;

    // Call AgentService to confirm or cancel
    const response = await this.getAgentService().confirmPendingAction(
      conversationId,
      result.confirmed,
    );

    // Send response to UI
    this.sendMessageToChannel(null, response.text);
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
