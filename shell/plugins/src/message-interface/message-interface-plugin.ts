import { InterfacePlugin } from "../interface/interface-plugin";
import { PluginError } from "../errors";
import type { JobProgressEvent, JobContext } from "@brains/job-queue";
import type { MessageContext } from "@brains/messaging-service";
import type { MessageInterfacePluginContext } from "./context";
import { createMessageInterfacePluginContext } from "./context";
import type { IShell, PluginCapabilities } from "../interfaces";
import type { z } from "zod";
import PQueue from "p-queue";

import { commandResponseSchema } from "@brains/command-registry";
import { setupProgressHandler } from "./progress-handler";

/**
 * Base implementation of MessageInterfacePlugin
 * Provides message processing functionality for interface plugins
 */
export abstract class MessageInterfacePlugin<
  TConfig = unknown,
> extends InterfacePlugin<TConfig> {
  // Override context type with declare modifier
  declare protected context?: MessageInterfacePluginContext;
  protected queue: PQueue;
  public readonly sessionId: string;
  // Track job/batch messages for editing (jobId/batchId -> messageId)
  protected jobMessages = new Map<string, string>();
  // Track started conversations per channel
  protected startedConversations = new Set<string>();
  // Track which channels are direct messages (1-on-1 conversations)
  protected directMessageChannels = new Set<string>();

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
  }

  /**
   * Handle progress events - must be implemented by each interface
   */
  protected abstract handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void>;

  /**
   * Send a message and return the message ID - must be implemented by each interface
   */
  protected abstract sendMessage(
    content: string,
    context: MessageContext,
    replyToId?: string,
  ): Promise<string>;

  /**
   * Edit an existing message - must be implemented by each interface
   */
  protected abstract editMessage(
    messageId: string,
    content: string,
    context: MessageContext,
  ): Promise<void>;

  /**
   * Check if a channel is a direct message (1-on-1 conversation)
   * Interfaces should override this to provide their own logic
   */
  protected isDirectMessage(channelId: string): boolean {
    return this.directMessageChannels.has(channelId);
  }

  /**
   * Mark a channel as a direct message
   */
  protected markAsDirectMessage(channelId: string): void {
    this.directMessageChannels.add(channelId);
  }

  /**
   * Determine if the bot should respond to a message
   * Default implementation: respond in DMs and when mentioned
   * Interfaces can override to add their own logic
   */
  protected shouldRespond(message: string, context: MessageContext): boolean {
    // Always respond in direct messages
    if (this.isDirectMessage(context.channelId)) {
      return true;
    }

    // Check for bot mentions (basic implementation)
    // Interfaces should override for platform-specific mention detection
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes("@bot") ||
      lowerMessage.includes("brain") ||
      lowerMessage.includes(this.id)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Show thinking indicators (typing, reactions, etc.)
   * Default: no-op. Override to show platform-specific indicators
   */
  protected async showThinkingIndicators(
    _context: MessageContext,
  ): Promise<void> {
    // Default no-op - interfaces can override if they have indicators
  }

  /**
   * Show done indicators (stop typing, final reaction, etc.)
   * Default: no-op. Override to show platform-specific indicators
   */
  protected async showDoneIndicators(_context: MessageContext): Promise<void> {
    // Default no-op - interfaces can override if they have indicators
  }

  /**
   * Get the plugin context, throwing if not initialized
   */
  protected override getContext(): MessageInterfacePluginContext {
    if (!this.context) {
      throw new PluginError(
        this.id,
        "Initialization failed: Plugin context not initialized",
      );
    }
    return this.context as MessageInterfacePluginContext;
  }

  /**
   * Override register to create MessageInterfacePluginContext
   */
  override async register(shell: IShell): Promise<PluginCapabilities> {
    // Create typed context with conversation management
    const context = createMessageInterfacePluginContext(shell, this.id);
    this.context = context;

    // Initialize daemon before registration
    this.initializeDaemon();

    // Call plugin-specific registration
    await this.onRegister(context);

    // Register daemon if provided
    await this.registerDaemon(context);

    return {
      resources: await this.getResources(),
      commands: await this.getCommands(),
      tools: await this.getTools(),
    };
  }

  /**
   * Register handlers and subscriptions
   */
  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Setup progress event handling with callbacks
    setupProgressHandler(context, {
      onProgress: async (event, eventContext) => {
        await this.handleProgressEvent(event, eventContext);
      },
      onError: (error) => {
        this.logger.error("Error handling progress event", {
          error,
          interfaceId: this.id,
        });
      },
      onInvalidSchema: () => {
        this.logger.warn("Invalid progress event schema", {
          interfaceId: this.id,
        });
      },
    });

    this.logger.debug("Message interface registered", { id: this.id });
  }

  /**
   * Process user input with default context handling
   */
  public async processInput(
    input: string,
    context?: Partial<MessageContext>,
  ): Promise<void> {
    const fullContext = this.buildContext(input, context);

    try {
      await this.handleInput(input, fullContext);
    } catch (error) {
      this.logger.error("Failed to process input", { error });
      throw error;
    }
  }

  /**
   * Build full message context from partial input
   */
  protected buildContext(
    _input: string,
    context?: Partial<MessageContext>,
  ): MessageContext {
    const userId = context?.userId ?? "default-user";
    const userPermissionLevel = this.determineUserPermissionLevel(userId);

    return {
      userId,
      channelId: context?.channelId ?? this.sessionId,
      messageId: context?.messageId ?? `msg-${Date.now()}`,
      timestamp: context?.timestamp ?? new Date(),
      interfaceType: this.id,
      userPermissionLevel,
      ...context,
    };
  }

  /**
   * Route input to appropriate handler and send response with job/batch mapping
   */
  protected async handleInput(
    input: string,
    context: MessageContext,
    replyToId?: string,
  ): Promise<void> {
    const conversationId = `${context.interfaceType}-${context.channelId}`;

    // 1. Start conversation if new channel (once per channel)
    if (!this.startedConversations.has(conversationId)) {
      try {
        // Start conversation returns the conversation ID (same as sessionId in this case)
        await this.getContext().startConversation(
          conversationId,
          context.interfaceType,
        );
        this.startedConversations.add(conversationId);
      } catch (error) {
        // Non-critical - continue even if conversation memory unavailable
        this.logger.debug("Could not start conversation", { error });
      }
    }

    // 2. Always store user message (even if bot won't respond)
    try {
      await this.getContext().addMessage(conversationId, "user", input, {
        messageId: context.messageId,
        userId: context.userId,
        timestamp: context.timestamp.toISOString(),
        directed: this.shouldRespond(input, context), // Track if for bot
      });
    } catch (error) {
      this.logger.debug("Could not store user message", { error });
    }

    // 3. Check if bot should respond
    if (!this.shouldRespond(input, context)) {
      return; // Message stored, no response needed
    }

    // 4. Process and respond
    await this.showThinkingIndicators(context);

    // Route to command or query
    const response = input.startsWith("/")
      ? await this.executeCommand(input, context)
      : await this.processQuery(input, context);

    // Handle structured response or plain string
    let messageText: string;
    let jobId: string | undefined;
    let batchId: string | undefined;

    if (typeof response === "string") {
      messageText = response;
    } else {
      messageText = response.message;
      jobId = response.jobId;
      batchId = response.batchId;
    }

    // Send the message and get the message ID
    const messageId = await this.sendMessage(messageText, context, replyToId);

    // Store job/batch message mapping if we have IDs
    if (jobId) {
      this.jobMessages.set(jobId, messageId);
      this.logger.info("Stored job message mapping", { jobId, messageId });
    }
    if (batchId) {
      this.jobMessages.set(batchId, messageId);
      this.logger.info("Stored batch message mapping", { batchId, messageId });
    }

    // 5. Store assistant response
    try {
      await this.getContext().addMessage(
        conversationId,
        "assistant",
        messageText,
        { messageId, timestamp: new Date().toISOString() },
      );
    } catch (error) {
      this.logger.debug("Could not store assistant message", { error });
    }

    await this.showDoneIndicators(context);
  }

  /**
   * Process queries through the shell
   */
  public async processQuery(
    query: string,
    context: MessageContext,
  ): Promise<string> {
    const pluginContext = this.getContext();

    const result = await this.queue.add(async () => {
      const queryResponse = await pluginContext.query(query, {
        userId: context.userId,
        conversationId: context.channelId,
        messageId: context.messageId,
        threadId: context.threadId,
        timestamp: context.timestamp.toISOString(),
      });

      return queryResponse.message;
    });

    if (!result) {
      throw new Error("No response from query processor");
    }

    return result;
  }

  /**
   * Execute commands
   */
  public async executeCommand(
    command: string,
    context: MessageContext,
  ): Promise<{ message: string; jobId?: string; batchId?: string }> {
    const pluginContext = this.getContext();

    const [cmd, ...args] = command.slice(1).split(" ");

    if (!cmd) {
      return {
        message: "Invalid command format. Type /help for available commands.",
      };
    }

    // Special case for help command
    if (cmd === "help") {
      const commands = await pluginContext.listCommands();
      const helpText = [
        "Available commands:",
        "",
        ...commands.map((c) => {
          if (c.usage) {
            return `  /${c.name} - ${c.description}\n    Usage: ${c.usage}`;
          }
          return `  /${c.name} - ${c.description}`;
        }),
      ].join("\n");

      return {
        message: helpText,
      };
    }

    const commands = await pluginContext.listCommands();
    const commandDef = commands.find((c) => c.name === cmd);

    if (commandDef) {
      // Convert MessageContext to CommandContext
      const commandContext = {
        userId: context.userId,
        channelId: context.channelId,
        interfaceType: context.interfaceType,
        userPermissionLevel: context.userPermissionLevel,
      };
      const result = await pluginContext.executeCommand(
        cmd,
        args,
        commandContext,
      );
      // Parse the command response using the schema from command-registry
      const parsed = commandResponseSchema.parse(result);

      // Return structured data with the message and relevant IDs
      switch (parsed.type) {
        case "job-operation":
          return {
            message: parsed.message,
            jobId: parsed.jobId,
          };
        case "batch-operation":
          return {
            message: parsed.message,
            batchId: parsed.batchId,
          };
        case "message":
          return {
            message: parsed.message,
          };
      }
    }

    // Return a simple message response for unknown commands
    return {
      message: `Unknown command: ${command}. Type /help for available commands.`,
    };
  }

  /**
   * Add context message for conversation history
   */
  public async addContext(
    message: string,
    context: MessageContext,
  ): Promise<void> {
    this.logger.debug("Adding context message", {
      userId: context.userId,
      channelId: context.channelId,
      message: message.substring(0, 100),
    });
  }
}
