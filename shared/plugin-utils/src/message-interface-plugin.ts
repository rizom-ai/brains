import type { DefaultQueryResponse } from "@brains/types";
import type {
  IMessageInterfacePlugin,
  MessageContext,
  PluginContext,
} from "./interfaces";
import { z } from "zod";
import { InterfacePlugin } from "./interface-plugin";
import { EventEmitter } from "node:events";
import PQueue from "p-queue";
import { JobProgressEventSchema } from "@brains/job-queue";

/**
 * Structured response schemas
 */
const batchOperationResponseSchema = z.object({
  type: z.literal("batch-operation"),
  batchId: z.string(),
  message: z.string(),
  operationCount: z.number(),
});

export type BatchOperationResponse = z.infer<
  typeof batchOperationResponseSchema
>;

const commandResponseSchema = z.union([
  z.string(),
  batchOperationResponseSchema,
]);

export type CommandResponse = z.infer<typeof commandResponseSchema>;

/**
 * Command definition interface
 */
export interface Command {
  name: string;
  description: string;
  usage?: string;
  handler: (
    args: string[],
    context: MessageContext,
  ) => Promise<CommandResponse>;
}

// Test job schemas
const testBatchJobSchema = z.object({
  duration: z.number().optional().default(1000),
  item: z.number().optional(),
});

const testSlowJobSchema = z.object({
  duration: z.number().optional().default(5000),
  message: z.string().optional(),
});

type TestBatchJobData = z.infer<typeof testBatchJobSchema>;
type TestSlowJobData = z.infer<typeof testSlowJobSchema>;

/**
 * Base implementation of MessageInterfacePlugin
 * Provides message processing functionality with event emitter capabilities
 */
export abstract class MessageInterfacePlugin<TConfig = unknown>
  extends InterfacePlugin<TConfig>
  implements IMessageInterfacePlugin
{
  protected queue: PQueue;
  public readonly sessionId: string;
  private eventEmitter: EventEmitter;

  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    partialConfig: Partial<TConfig>,
    configSchema: z.ZodType<TConfig>,
    defaults: Partial<TConfig>,
    sessionId?: string,
  ) {
    super(id, packageJson, partialConfig, configSchema, defaults);
    this.sessionId = sessionId ?? `${id}-session-${Date.now()}`;
    this.queue = new PQueue({
      concurrency: 1,
      interval: 1000,
      intervalCap: 10,
    });
    this.eventEmitter = new EventEmitter();
  }

  // EventEmitter delegation
  public on(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  public once(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  public off(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  public emit(event: string, ...args: unknown[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  /**
   * Get base commands available to all message interfaces
   * Override this to add interface-specific commands
   */
  protected getCommands(): Command[] {
    return [
      {
        name: "help",
        description: "Show this help message",
        handler: async () => this.getHelpText(),
      },
      {
        name: "search",
        description: "Search your knowledge base",
        usage: "/search <query>",
        handler: async (args, context) => {
          if (args.length === 0) {
            return "Please provide a search query. Usage: /search <query>";
          }
          const searchQuery = args.join(" ");
          return this.processQuery(searchQuery, context);
        },
      },
      {
        name: "list",
        description: "List entities (notes, tasks, etc.)",
        usage: "/list [type]",
        handler: async (args, context) => {
          const listQuery = args[0] ? `list all ${args[0]}` : "list all notes";
          return this.processQuery(listQuery, context);
        },
      },
      {
        name: "test-progress",
        description: "Test progress tracking with a slow job",
        handler: async () => {
          if (!this.context) {
            return "Plugin context not initialized";
          }
          try {
            const jobId = await this.context.enqueueJob("test-slow-job", {
              duration: 10000,
              message: "Testing progress tracking",
            });
            return `Test job enqueued with ID: ${jobId}\nWatch the status bar for progress!`;
          } catch (error) {
            return `Failed to enqueue test job: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },
      {
        name: "test-batch",
        description: "Test batch progress tracking",
        usage: "/test-batch [count]",
        handler: async (args) => {
          if (!this.context) {
            return "Plugin context not initialized";
          }
          try {
            const count = parseInt(args[0] ?? "5") || 5;
            const operations = Array.from({ length: count }, (_, i) => ({
              type: `${this.id}:test-batch-job`,
              entityId: `test-entity-${i}`,
              entityType: "test",
              options: {
                item: i + 1,
                duration: 1000 + i * 500,
              },
            }));
            const batchId = await this.context.enqueueBatch(operations, {
              priority: 5,
            });

            // Return structured response
            return {
              type: "batch-operation" as const,
              batchId,
              message: `Batch operation enqueued with ID: ${batchId}\n${count} operations queued.`,
              operationCount: count,
            };
          } catch (error) {
            return `Failed to enqueue batch: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },
    ];
  }

  /**
   * Override onRegister to register test handlers for all message interfaces
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // Listen for batch operation events and auto-subscribe to their progress
    this.on("batch-operation-created", (...args: unknown[]) => {
      const response = args[0] as BatchOperationResponse;
      // Auto-subscribe to progress updates for this batch
      const unsubscribe = context.subscribe("job-progress", async (message) => {
        const validationResult = JobProgressEventSchema.safeParse(
          message.payload,
        );
        if (!validationResult.success) {
          return { success: true };
        }

        const progressEvent = validationResult.data;
        if (
          progressEvent.type === "batch" &&
          progressEvent.id === response.batchId
        ) {
          // Emit for any listeners (CLI React components, Matrix tracking, etc.)
          this.emit("batch-progress", progressEvent);

          // Unsubscribe when complete
          if (
            progressEvent.status === "completed" ||
            progressEvent.status === "failed"
          ) {
            unsubscribe();
          }
        }

        return { success: true };
      });
    });

    // Register test batch job handler for progress testing
    // Available to all message interfaces (CLI, Matrix, etc.)
    context.registerJobHandler("test-batch-job", {
      process: async (data: TestBatchJobData) => {
        const duration = data.duration;
        await new Promise((resolve) => setTimeout(resolve, duration));
        return { success: true, item: data.item };
      },
      validateAndParse: (data: unknown): TestBatchJobData | null => {
        const parsed = testBatchJobSchema.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
    });

    // Register test slow job handler for single job progress testing
    // Available to all message interfaces (CLI, Matrix, etc.)
    context.registerJobHandler("test-slow-job", {
      process: async (data: TestSlowJobData) => {
        const duration = data.duration;
        const steps = 10;
        const stepDuration = duration / steps;

        for (let i = 0; i < steps; i++) {
          await new Promise((resolve) => setTimeout(resolve, stepDuration));
          // Progress is tracked automatically by the job queue
        }

        return { success: true, message: data.message ?? "Test completed!" };
      },
      validateAndParse: (data: unknown): TestSlowJobData | null => {
        const parsed = testSlowJobSchema.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
    });

    this.logger.debug("Registered test job handlers for message interface");
  }

  /**
   * Process user input with default context handling
   */
  public async processInput(
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
      this.emit("response", response);
    } catch (error) {
      this.logger.error("Failed to process input", { error });
      this.emit("error", error);
    }
  }

  /**
   * Handle user input - routes to appropriate method based on input type
   * Can be overridden by subclasses for custom routing logic
   */
  protected async handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string> {
    // Default routing logic: commands start with '/', everything else is a query
    if (input.startsWith("/")) {
      // executeCommand already handles structured responses
      return this.executeCommand(input, context);
    }

    return this.processQuery(input, context);
  }

  /**
   * Store context messages for conversation history (no response needed)
   * Override this to customize context storage behavior
   */
  public async addContext(
    message: string,
    context: MessageContext,
  ): Promise<void> {
    // Default: Store in conversation history for future reference
    // For now, we just log it - could be enhanced to store in database
    this.logger.debug("Adding context message", {
      userId: context.userId,
      channelId: context.channelId,
      message: message.substring(0, 100),
    });
  }

  /**
   * Process queries through the shell and return response
   * Override this to customize query processing
   */
  public async processQuery(
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
   * Execute interface-specific commands
   * Override this to add interface-specific commands like /help, /quit, etc.
   */
  public async executeCommand(
    command: string,
    context: MessageContext,
  ): Promise<string> {
    const [cmd, ...args] = command.slice(1).split(" ");

    // Get all available commands
    const commands = this.getCommands();
    const commandDef = commands.find((c) => c.name === cmd);

    if (commandDef) {
      const response = await commandDef.handler(args, context);

      // Validate and handle the response
      const parsed = commandResponseSchema.parse(response);

      if (typeof parsed === "string") {
        return parsed;
      }

      // Handle batch operation response
      // Emit event for interfaces that want to track this batch
      this.emit("batch-operation-created", parsed);
      // Return the user-friendly message
      return parsed.message;
    }

    return `Unknown command: ${command}. Type /help for available commands.`;
  }

  /**
   * Get help text for common commands
   * Override this to customize or extend the help message
   */
  protected getHelpText(): string {
    const commands = this.getCommands();
    const commandList = commands
      .map((cmd) => {
        const usage = cmd.usage ?? `/${cmd.name}`;
        return `• ${usage} - ${cmd.description}`;
      })
      .join("\n");

    return `Available commands:
${commandList}

Type any message to interact with the brain.`;
  }
}
