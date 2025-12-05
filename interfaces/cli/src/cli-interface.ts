import {
  InterfacePlugin,
  type InterfacePluginContext,
  PluginError,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/daemon-registry";
import type { JobProgressEvent, JobContext } from "@brains/plugins";
import type { IAgentService } from "@brains/agent-service";
import type { Instance } from "ink";
import { cliConfigSchema, type CLIConfig } from "./config";
import { progressReducer } from "./handlers/progress";
import packageJson from "../package.json";

/**
 * CLI Interface - Agent-based architecture
 *
 * This interface:
 * - Routes ALL messages to AgentService (no command parsing)
 * - Uses AI agent for natural language interaction
 * - Keeps local UI commands (/exit, /clear, /progress) for CLI-specific controls
 */
export class CLIInterface extends InterfacePlugin<CLIConfig> {
  declare protected config: CLIConfig;
  private inkApp: Instance | null = null;
  private progressEvents = new Map<string, JobProgressEvent>();
  private progressCallback: ((events: JobProgressEvent[]) => void) | undefined;
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
    await super.onRegister(context);

    // Get AgentService from context
    this.agentService = context.agentService;

    this.logger.debug("CLI interface registered with AgentService");
  }

  /**
   * Register callback to receive progress event updates
   */
  public registerProgressCallback(
    callback: (events: JobProgressEvent[]) => void,
  ): void {
    this.progressCallback = callback;
    // Send current state immediately (only processing events)
    const processingEvents = Array.from(this.progressEvents.values()).filter(
      (event) => event.status === "processing",
    );
    callback(processingEvents);
  }

  /**
   * Unregister progress callback
   */
  public unregisterProgressCallback(): void {
    this.progressCallback = undefined;
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
   * Send response to the CLI UI
   */
  private sendResponse(response: string): void {
    if (this.responseCallback) {
      this.responseCallback(response);
    }
  }

  /**
   * Handle progress events - show ALL job queue and batch updates
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // Show all progress events, not just owned jobs
    // This allows monitoring of system-initiated jobs, auto-extraction, etc.

    // Update local progress state for UI
    this.progressEvents = progressReducer(this.progressEvents, {
      type: "UPDATE_PROGRESS",
      payload: progressEvent,
    });

    // Clean up completed events after a delay to allow UI to show completion
    if (
      progressEvent.status === "completed" ||
      progressEvent.status === "failed"
    ) {
      setTimeout(() => {
        this.progressEvents = progressReducer(this.progressEvents, {
          type: "CLEANUP_PROGRESS",
          payload: progressEvent,
        });
        // Update UI after cleanup
        if (this.progressCallback) {
          const allEvents = Array.from(this.progressEvents.values());
          this.progressCallback(allEvents);
        }
      }, 500); // Keep completed events visible for 500ms
    }

    // Notify React component of progress changes
    if (this.progressCallback) {
      const allEvents = Array.from(this.progressEvents.values());
      this.progressCallback(allEvents);
    }

    // Progress is displayed in status bar - no inline message editing needed
    this.logger.debug("Progress event received", {
      jobId: progressEvent.id,
      status: progressEvent.status,
      progress: progressEvent.progress,
      operationType: progressEvent.metadata.operationType,
      operationTarget: progressEvent.metadata.operationTarget,
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

      // Send response to UI
      this.sendResponse(response.text);
    } catch (error) {
      this.logger.error("Error processing input", { error, input });
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      this.sendResponse(`**Error:** ${errorMessage}`);
    }
  }

  /**
   * Handle confirmation responses (yes/no)
   */
  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
  ): Promise<void> {
    const normalizedMessage = message.toLowerCase().trim();
    const isConfirmed =
      normalizedMessage === "yes" ||
      normalizedMessage === "y" ||
      normalizedMessage === "confirm";

    // Clear pending confirmation
    this.pendingConfirmation = false;

    // Call AgentService to confirm or cancel
    const response = await this.getAgentService().confirmPendingAction(
      conversationId,
      isConfirmed,
    );

    // Send response to UI
    this.sendResponse(response.text);
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
