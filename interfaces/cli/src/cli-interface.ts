import {
  MessageInterfacePlugin,
  PluginInitializationError,
  type Command,
} from "@brains/plugin-utils";
import type { MessageContext, PluginContext } from "@brains/plugin-utils";
import type { UserPermissionLevel } from "@brains/utils";
import type { DefaultQueryResponse } from "@brains/types";
import { JobProgressEventSchema } from "@brains/job-queue";
import type { Instance } from "ink";
import type { CLIConfig, CLIConfigInput } from "./types";
import { cliConfigSchema } from "./types";
import packageJson from "../package.json";

export class CLIInterface extends MessageInterfacePlugin<CLIConfigInput> {
  declare protected config: CLIConfig;
  private inkApp: Instance | null = null;
  private jobProgressUnsubscribe: (() => void) | null = null;

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
   * Override to add CLI-specific commands
   */
  protected override getCommands(): Command[] {
    const baseCommands = super.getCommands();
    const cliCommands: Command[] = [
      {
        name: "clear",
        description: "Clear the screen",
        handler: async (): Promise<string> => {
          console.clear();
          return "";
        },
      },
      {
        name: "exit",
        description: "Exit the CLI",
        handler: async (): Promise<string> => {
          void this.stop().then(() => process.exit(0));
          return "Exiting...";
        },
      },
      {
        name: "quit",
        description: "Exit the CLI",
        handler: async (): Promise<string> => {
          void this.stop().then(() => process.exit(0));
          return "Exiting...";
        },
      },
    ];

    return [...baseCommands, ...cliCommands];
  }

  /**
   * Register handlers and other initialization when plugin is registered
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);
    // Test handlers are now registered in the base MessageInterfacePlugin class

    // Subscribe to job progress events and re-emit them for React components
    this.jobProgressUnsubscribe = context.subscribe(
      "job-progress",
      async (message) => {
        // Validate the event payload
        const validationResult = JobProgressEventSchema.safeParse(
          message.payload,
        );
        if (!validationResult.success) {
          this.logger.warn("Invalid job progress event", {
            error: validationResult.error,
            payload: message.payload,
          });
          return { success: true };
        }

        // Emit the validated progress event for React components
        this.emit("job-progress", validationResult.data);

        return { success: true };
      },
    );

    // Listen for batch progress events from the base class
    this.on("batch-progress", (...args: unknown[]) => {
      // Re-emit as job-progress for React components
      this.emit("job-progress", args[0]);
    });
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

  // processInput no longer needs override - batch tracking is handled via events in onRegister

  // No need to override executeCommand or getHelpText anymore
  // The base class handles it using getCommands()

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
        import("./components/App"),
      ]);

      const { render } = inkModule;
      const React = reactModule.default;
      const App = appModule.default;

      // Ensure we're using React's createElement, not any bundled version
      const element = React.createElement(App, { interface: this });
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

    // Unsubscribe from job progress events
    if (this.jobProgressUnsubscribe) {
      this.jobProgressUnsubscribe();
      this.jobProgressUnsubscribe = null;
    }

    if (this.inkApp) {
      this.inkApp.unmount();
      this.inkApp = null;
    }
  }
}
