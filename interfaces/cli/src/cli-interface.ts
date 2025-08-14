import {
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
  PluginError,
  type Daemon,
  type DaemonHealth,
} from "@brains/plugins";
import type {
  MessageContext,
  Command,
  UserPermissionLevel,
  JobProgressEvent,
  JobContext,
} from "@brains/plugins";
import type { Instance } from "ink";
import { cliConfigSchema, defaultCLIConfig, type CLIConfig } from "./config";
import { handleProgressEvent, MessageHandlers } from "./handlers";
import { createCLICommands } from "./commands";
import packageJson from "../package.json";

export class CLIInterface extends MessageInterfacePlugin<CLIConfig> {
  declare protected config: CLIConfig;
  private inkApp: Instance | null = null;
  private progressEvents = new Map<string, JobProgressEvent>();
  private progressCallback: ((events: JobProgressEvent[]) => void) | undefined;
  private messageHandlers = new MessageHandlers();

  constructor(config: Partial<CLIConfig> = {}) {
    super("cli", packageJson, config, cliConfigSchema, defaultCLIConfig);
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

    // Mark the CLI channel as a direct message
    this.markAsDirectMessage("cli");
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
    this.messageHandlers.registerResponseCallback(callback);
  }

  /**
   * Unregister response callbacks
   */
  public unregisterMessageCallbacks(): void {
    this.messageHandlers.unregisterMessageCallbacks();
  }

  /**
   * Handle progress events - unified handler using reducer pattern
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    this.progressEvents = await handleProgressEvent(
      progressEvent,
      context,
      this.progressEvents,
      {
        progressCallback: this.progressCallback,
        editMessage: (messageId, content, ctx) =>
          this.editMessage(messageId, content, ctx),
      },
      this.jobMessages,
      this.logger,
    );
  }

  /**
   * Override getCommands to add CLI-specific commands
   */
  protected override async getCommands(): Promise<Command[]> {
    // Create CLI-specific commands with state management
    // Note: showProgress state is managed elsewhere in the CLI
    const commandState = {
      showProgress: false, // This is a placeholder - actual state should be managed by the CLI instance
    };

    return createCLICommands(commandState);
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
    context: MessageContext,
    replyToId?: string,
  ): Promise<string> {
    return this.messageHandlers.sendMessage(content, context, replyToId);
  }

  /**
   * Edit message - for CLI, just send new message (React component will handle replacement)
   */
  protected async editMessage(
    messageId: string,
    content: string,
    context: MessageContext,
  ): Promise<void> {
    return this.messageHandlers.editMessage(messageId, content, context);
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
            await this.cleanup();
          });
          process.on("SIGTERM", async (): Promise<void> => {
            this.logger.info("Received SIGTERM, stopping CLI interface");
            await this.cleanup();
          });
        } catch (error) {
          this.logger.error("Failed to start CLI interface", { error });
          throw error;
        }
      },
      stop: async (): Promise<void> => {
        this.logger.info("Stopping CLI interface");
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
   * Process user input - public API for UI components, testing, and programmatic use
   * Creates appropriate context and delegates to handleInput
   */
  public override async processInput(input: string): Promise<void> {
    const context: MessageContext = {
      userId: "cli-user",
      channelId: "cli",
      messageId: `cli-${Date.now()}`,
      timestamp: new Date(),
      interfaceType: "cli",
      userPermissionLevel: "anchor", // CLI users have anchor permissions
    };

    await this.handleInput(input, context);
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
