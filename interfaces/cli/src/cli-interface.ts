import {
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
} from "@brains/message-interface-plugin";
import type { MessageContext } from "@brains/messaging-service";
import type { Command } from "@brains/command-registry";
import {
  PluginInitializationError,
  type Daemon,
  type DaemonHealth,
} from "@brains/plugins";
import type { UserPermissionLevel } from "@brains/utils";
import type { Instance } from "ink";
import type { JobProgressEvent } from "@brains/job-queue";
import type { JobContext } from "@brains/db";
import type { CLIConfig, CLIConfigInput } from "./types";
import { cliConfigSchema } from "./types";
import packageJson from "../package.json";

export class CLIInterface extends MessageInterfacePlugin<CLIConfigInput> {
  declare protected config: CLIConfig;
  private inkApp: Instance | null = null;
  private progressEvents = new Map<string, JobProgressEvent>();
  private progressCallback: ((events: JobProgressEvent[]) => void) | undefined;
  private responseCallback: ((response: string) => void) | undefined;

  constructor(config: CLIConfigInput = {}) {
    const defaults: Partial<CLIConfig> = {
      theme: {
        primaryColor: "#0066cc",
        accentColor: "#ff6600",
      },
    };

    super("cli", packageJson, config, cliConfigSchema, defaults);
  }

  public override determineUserPermissionLevel(
    _userId: string,
  ): UserPermissionLevel {
    return "anchor";
  }

  /**
   * Get the interface permission grant for CLI
   * CLI grants anchor permissions due to local access assumption
   */
  protected getInterfacePermissionGrant(): UserPermissionLevel {
    return "anchor";
  }

  /**
   * Register handlers and other initialization when plugin is registered
   */
  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    // Test handlers and MessageBus subscriptions are now handled in the base MessageInterfacePlugin class
    // Progress events will be routed to our handleJobProgressEvent and handleBatchProgressEvent methods
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
   * Handle progress events - unified handler using reducer pattern
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    try {
      // CLI only handles events from CLI interface
      if (context.interfaceId !== "cli") {
        return; // Event not from CLI interface
      }

      // Add/update all events (processing, completed, failed)
      this.progressEvents = this.progressReducer(this.progressEvents, {
        type: "UPDATE_PROGRESS",
        payload: progressEvent,
      });

      // Always notify React component of the change
      if (this.progressCallback) {
        // Send all events to the status bar
        const allEvents = Array.from(this.progressEvents.values());
        this.progressCallback(allEvents);
      }

      // Also send progress update as message edit for inline progress bars
      const existingMessageId = this.jobMessages.get(progressEvent.id);
      if (existingMessageId) {
        // Format progress message similar to Matrix style
        const operationType = progressEvent.metadata.operationType.replace(
          /_/g,
          " ",
        );
        const operationTarget = progressEvent.metadata.operationTarget ?? "";

        let message = "";
        if (progressEvent.status === "completed") {
          message = `✅ **${operationType}${operationTarget ? `: ${operationTarget}` : ""}** completed`;
        } else if (progressEvent.status === "failed") {
          message = `❌ **${operationType}${operationTarget ? `: ${operationTarget}` : ""}** failed`;
        } else if (
          progressEvent.status === "processing" &&
          progressEvent.progress
        ) {
          message = `🔄 **${operationType}${operationTarget ? `: ${operationTarget}` : ""}** in progress`;
          if (progressEvent.progress.total > 0) {
            message += `\n📊 Progress: ${progressEvent.progress.current}/${progressEvent.progress.total} (${progressEvent.progress.percentage}%)`;
          }
          if (operationTarget) {
            message += `\n📂 Target: \`${operationTarget}\``;
          }
        }

        if (message) {
          await this.editMessage(existingMessageId, message, {
            userId: progressEvent.metadata.userId,
            channelId: progressEvent.metadata.channelId ?? "cli",
            messageId: existingMessageId,
            timestamp: new Date(),
            interfaceType: "cli",
            userPermissionLevel: "anchor",
          });
        }
      }
    } catch (error) {
      this.logger.error("Error handling progress event in CLI", { error });
    }
  }

  /**
   * Progress reducer for state management
   */
  private progressReducer(
    state: Map<string, JobProgressEvent>,
    action: {
      type: "UPDATE_PROGRESS" | "CLEANUP_PROGRESS";
      payload: JobProgressEvent;
    },
  ): Map<string, JobProgressEvent> {
    const newState = new Map(state);

    switch (action.type) {
      case "UPDATE_PROGRESS":
        newState.set(action.payload.id, action.payload);
        break;
      case "CLEANUP_PROGRESS":
        newState.delete(action.payload.id);
        break;
      default:
        return state;
    }

    return newState;
  }

  /**
   * Override getCommands to add CLI-specific commands
   */
  protected override async getCommands(): Promise<Command[]> {
    // Add CLI-specific commands
    const cliCommands: Command[] = [
      {
        name: "progress",
        description: "Toggle detailed progress display",
        handler: async (_args, _context) => ({
          type: "message" as const,
          message:
            "Progress display toggled. You can also use Ctrl+P for quick toggle.",
        }),
      },
      {
        name: "clear",
        description: "Clear the screen",
        handler: async (_args, _context) => ({
          type: "message" as const,
          message: "\x1B[2J\x1B[H", // ANSI escape codes to clear screen and move cursor to top
        }),
      },
    ];

    return cliCommands;
  }

  /**
   * The CLI doesn't need to override processQuery anymore since the base class
   * in MessageInterfacePlugin handles it correctly. The InterfacePluginContext
   * automatically grants trusted permissions for interface plugins.
   */

  /**
   * Send a message using CLI callback system
   */
  protected async sendMessage(
    content: string,
    _context: MessageContext,
    _replyToId?: string,
  ): Promise<string> {
    // Use callback to send response
    if (this.responseCallback) {
      this.responseCallback(content);
    }
    // Return a synthetic message ID for CLI
    return `cli-msg-${Date.now()}`;
  }

  /**
   * Edit message - for CLI, just send new message (React component will handle replacement)
   */
  protected async editMessage(
    _messageId: string,
    content: string,
    _context: MessageContext,
  ): Promise<void> {
    // For CLI, editing means sending a new message
    // The React component will detect progress messages and handle replacement
    if (this.responseCallback) {
      this.responseCallback(content);
    }
  }

  /**
   * Create daemon for managing CLI lifecycle
   */
  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        if (!this.context) {
          throw new PluginInitializationError(
            this.id,
            new Error("Plugin context not initialized"),
            { method: "start" },
          );
        }
        this.logger.info("Starting CLI interface");

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
            this.logger.info("Received SIGINT, stopping CLI interface");
            // Clean up callbacks
            this.unregisterProgressCallback();
            this.unregisterMessageCallbacks();
            if (this.inkApp) {
              this.inkApp.unmount();
            }
          });
          process.on("SIGTERM", async (): Promise<void> => {
            this.logger.info("Received SIGTERM, stopping CLI interface");
            // Clean up callbacks
            this.unregisterProgressCallback();
            this.unregisterMessageCallbacks();
            if (this.inkApp) {
              this.inkApp.unmount();
            }
          });
        } catch (error) {
          this.logger.error("Failed to start CLI interface", { error });
          throw error;
        }
      },
      stop: async (): Promise<void> => {
        this.logger.info("Stopping CLI interface");

        // Clean up all callbacks
        this.unregisterProgressCallback();
        this.unregisterMessageCallbacks();

        if (this.inkApp) {
          this.inkApp.unmount();
          this.inkApp = null;
        }
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
            hasCallbacks:
              this.progressCallback !== undefined ||
              this.responseCallback !== undefined,
          },
        };
      },
    };
  }
}
