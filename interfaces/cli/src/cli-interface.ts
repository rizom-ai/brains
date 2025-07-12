import {
  MessageInterfacePlugin,
  type Command,
  type MessageContext,
} from "@brains/message-interface";
import { PluginInitializationError } from "@brains/plugin-utils";
import type { PluginContext } from "@brains/plugin-utils";
import type { UserPermissionLevel } from "@brains/utils";
import type { DefaultQueryResponse } from "@brains/types";
import type { Instance } from "ink";
import type { JobProgressEvent } from "@brains/job-queue";
import type { ProgressEventContext } from "@brains/db";
import type { CLIConfig, CLIConfigInput } from "./types";
import { cliConfigSchema } from "./types";
import packageJson from "../package.json";

export class CLIInterface extends MessageInterfacePlugin<CLIConfigInput> {
  declare protected config: CLIConfig;
  private inkApp: Instance | null = null;
  private progressEvents = new Map<string, JobProgressEvent>();
  private progressCallback: ((events: JobProgressEvent[]) => void) | undefined;
  private responseCallback: ((response: string) => void) | undefined;
  private errorCallback: ((error: Error) => void) | undefined;

  /**
   * Get active jobs from the context
   */
  public async getActiveJobs(
    types?: string[],
  ): ReturnType<NonNullable<typeof this.context>["getActiveJobs"]> {
    if (!this.context) {
      throw new Error("Plugin context not initialized");
    }
    const jobs = await this.context.getActiveJobs(types);
    this.logger.debug("Active jobs fetched", { count: jobs.length, types });
    return jobs;
  }

  /**
   * Get active batches from the context
   */
  public async getActiveBatches(): ReturnType<
    NonNullable<typeof this.context>["getActiveBatches"]
  > {
    if (!this.context) {
      throw new Error("Plugin context not initialized");
    }
    const batches = await this.context.getActiveBatches();
    this.logger.debug("Active batches fetched", { count: batches.length });
    return batches;
  }

  /**
   * Get batch status from the context
   */
  public async getBatchStatus(
    batchId: string,
  ): ReturnType<NonNullable<typeof this.context>["getBatchStatus"]> {
    if (!this.context) {
      throw new Error("Plugin context not initialized");
    }
    return this.context.getBatchStatus(batchId);
  }

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
  protected override async onRegister(context: PluginContext): Promise<void> {
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
   * Register callback to receive error events
   */
  public registerErrorCallback(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Unregister response and error callbacks
   */
  public unregisterMessageCallbacks(): void {
    this.responseCallback = undefined;
    this.errorCallback = undefined;
  }

  /**
   * Handle progress events - unified handler using reducer pattern
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: ProgressEventContext,
  ): Promise<void> {
    try {
      // CLI only handles events from CLI interface
      if (context.interfaceId !== "cli") {
        return; // Event not from CLI interface
      }

      // Only show progress for jobs that are actively processing
      if (progressEvent.status === "processing") {
        // Add/update processing event
        this.progressEvents = this.progressReducer(this.progressEvents, {
          type: "UPDATE_PROGRESS",
          payload: progressEvent,
        });
      } else {
        // Remove any non-processing events (pending, completed, failed)
        this.progressEvents = this.progressReducer(this.progressEvents, {
          type: "CLEANUP_PROGRESS",
          payload: progressEvent,
        });
      }

      // Always notify React component of the change
      if (this.progressCallback) {
        // Only send processing events to the UI as an array
        const processingEvents = Array.from(
          this.progressEvents.values(),
        ).filter((event) => event.status === "processing");
        this.progressCallback(processingEvents);
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
  protected override getCommands(): Command[] {
    const baseCommands = super.getCommands();

    // Add CLI-specific commands
    const cliCommands: Command[] = [
      {
        name: "progress",
        description: "Toggle detailed progress display",
        handler: async (): Promise<string> => {
          // This is handled in the EnhancedApp component directly
          return "Progress display toggled. You can also use Ctrl+P for quick toggle.";
        },
      },
      {
        name: "clear",
        description: "Clear the screen",
        handler: async (): Promise<string> => {
          // This is handled in the EnhancedApp component directly
          return "Screen cleared.";
        },
      },
    ];

    return [...baseCommands, ...cliCommands];
  }

  /**
   * Override processQuery to grant interface permissions for CLI users
   */
  public override async processQuery(
    query: string,
    context: MessageContext,
  ): Promise<string> {
    if (!this.context) {
      throw new Error("Plugin context not initialized");
    }

    const result = await this.queue.add(async () => {
      // Use Shell's knowledge-query template to process the query and get response
      if (!this.context) {
        throw new Error("Plugin context not initialized");
      }
      const queryResponse =
        await this.context.generateContent<DefaultQueryResponse>({
          prompt: query,
          templateName: "shell:knowledge-query",
          userId: context.userId,
          interfacePermissionGrant: this.getInterfacePermissionGrant(),
          data: {
            userId: context.userId,
            conversationId: context.channelId,
            messageId: context.messageId,
            threadId: context.threadId,
            timestamp: context.timestamp.toISOString(),
          },
        });

      // Return the already-formatted response from the template system
      return queryResponse.message;
    });

    if (!result) {
      throw new Error("No response from query processor");
    }

    return result;
  }

  /**
   * Override processInput to use callbacks instead of EventEmitter
   */
  public override async processInput(
    input: string,
    context?: Partial<MessageContext>,
  ): Promise<void> {
    const userId = context?.userId ?? "default-user";
    const userPermissionLevel = this.determineUserPermissionLevel(userId);

    const fullContext: MessageContext = {
      userId,
      channelId: context?.channelId ?? this.sessionId,
      messageId: context?.messageId ?? `msg-${Date.now()}`,
      timestamp: context?.timestamp ?? new Date(),
      interfaceType: this.id,
      userPermissionLevel,
      ...context,
    };

    try {
      const response = await this.handleInput(input, fullContext);
      // Use callback instead of EventEmitter
      if (this.responseCallback) {
        this.responseCallback(response);
      }
    } catch (error) {
      this.logger.error("Failed to process input", { error });
      // Use callback instead of EventEmitter
      if (this.errorCallback) {
        this.errorCallback(error as Error);
      }
    }
  }

  public async start(): Promise<void> {
    if (!this.context) {
      throw new PluginInitializationError(
        this.id,
        "Plugin context not initialized",
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
        registerErrorCallback: (callback) =>
          this.registerErrorCallback(callback),
        unregisterMessageCallbacks: () => this.unregisterMessageCallbacks(),
      });
      this.inkApp = render(element);

      // Handle process termination gracefully
      process.on("SIGINT", () => void this.stop());
      process.on("SIGTERM", () => void this.stop());
    } catch (error) {
      this.logger.error("Failed to start CLI interface", { error });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.logger.info("Stopping CLI interface");

    // Clean up all callbacks
    this.unregisterProgressCallback();
    this.unregisterMessageCallbacks();

    if (this.inkApp) {
      this.inkApp.unmount();
      this.inkApp = null;
    }
  }
}
