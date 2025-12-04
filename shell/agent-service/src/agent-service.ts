import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type {
  AIService as IAIService,
  AITool,
  AIMessage,
} from "@brains/ai-service";
import type { IMCPService, ToolContext } from "@brains/mcp-service";
import type { IConversationService } from "@brains/conversation-service";
import type { IdentityService as IIdentityService } from "@brains/identity-service";
import type {
  AgentConfig,
  AgentResponse,
  ChatContext,
  IAgentService,
  PendingConfirmation,
} from "./types";

/**
 * Default agent configuration
 */
const DEFAULT_CONFIG: Required<AgentConfig> = {
  maxSteps: 10,
};

/**
 * Agent Service - Orchestrates AI-powered conversations with tool access
 *
 * This service:
 * - Receives user messages and sends them to the AI with available tools
 * - Loads conversation history from ConversationService
 * - Converts MCP tools to AI-compatible format
 * - Builds system prompts from brain identity
 * - Handles confirmation flows for destructive operations
 */
export class AgentService implements IAgentService {
  private static instance: AgentService | null = null;
  private logger: Logger;
  private config: Required<AgentConfig>;

  // Track pending confirmations per conversation
  private pendingConfirmations = new Map<string, PendingConfirmation>();

  /**
   * Get the singleton instance
   */
  public static getInstance(
    aiService: IAIService,
    mcpService: IMCPService,
    conversationService: IConversationService,
    identityService: IIdentityService,
    logger: Logger,
    config?: AgentConfig,
  ): AgentService {
    AgentService.instance ??= new AgentService(
      aiService,
      mcpService,
      conversationService,
      identityService,
      logger,
      config,
    );
    return AgentService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    AgentService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    aiService: IAIService,
    mcpService: IMCPService,
    conversationService: IConversationService,
    identityService: IIdentityService,
    logger: Logger,
    config?: AgentConfig,
  ): AgentService {
    return new AgentService(
      aiService,
      mcpService,
      conversationService,
      identityService,
      logger,
      config,
    );
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(
    private aiService: IAIService,
    private mcpService: IMCPService,
    private conversationService: IConversationService,
    private identityService: IIdentityService,
    logger: Logger,
    config?: AgentConfig,
  ) {
    this.logger = logger.child("AgentService");
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Send a message to the agent and get a response
   */
  public async chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
  ): Promise<AgentResponse> {
    // Default to public permission for safety
    const userPermissionLevel = context?.userPermissionLevel ?? "public";

    this.logger.debug("Processing chat message", {
      conversationId,
      messageLength: message.length,
      userPermissionLevel,
    });

    // Load conversation history
    const historyMessages = await this.conversationService.getMessages(
      conversationId,
      { limit: 50 },
    );

    // Convert to AI message format
    const messages: AIMessage[] = historyMessages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system" | "tool",
      content: msg.content,
    }));

    // Add the new user message
    messages.push({ role: "user", content: message });

    // Get tools filtered by user permission level
    const tools = this.convertMCPToolsToAITools(
      conversationId,
      userPermissionLevel,
    );

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt();

    // Save user message to conversation
    await this.conversationService.addMessage(conversationId, "user", message);

    // Call AI with tools
    const result = await this.aiService.generateWithTools({
      system: systemPrompt,
      messages,
      tools,
      maxSteps: this.config.maxSteps,
    });

    // Save assistant response to conversation
    await this.conversationService.addMessage(
      conversationId,
      "assistant",
      result.text,
    );

    this.logger.debug("Chat completed", {
      conversationId,
      responseLength: result.text.length,
      toolCalls: result.toolCalls.length,
      usage: result.usage,
    });

    return {
      text: result.text,
      usage: result.usage,
    };
  }

  /**
   * Set a pending confirmation for a conversation
   * Called internally when a destructive operation is requested
   */
  public setPendingConfirmation(
    conversationId: string,
    confirmation: PendingConfirmation,
  ): void {
    this.pendingConfirmations.set(conversationId, confirmation);
    this.logger.debug("Pending confirmation set", {
      conversationId,
      toolName: confirmation.toolName,
    });
  }

  /**
   * Confirm or cancel a pending destructive operation
   */
  public async confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
  ): Promise<AgentResponse> {
    const pending = this.pendingConfirmations.get(conversationId);

    if (!pending) {
      return {
        text: "No pending action to confirm.",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    // Clear the pending confirmation
    this.pendingConfirmations.delete(conversationId);

    if (!confirmed) {
      // User cancelled
      await this.conversationService.addMessage(
        conversationId,
        "assistant",
        `Action cancelled: ${pending.description}`,
      );

      return {
        text: `Action cancelled: ${pending.description}`,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    // Execute the tool
    const tools = this.mcpService.listTools();
    const tool = tools.find((t) => t.tool.name === pending.toolName);

    if (!tool) {
      return {
        text: `Error: Tool '${pending.toolName}' not found.`,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    try {
      const context: ToolContext = {
        interfaceType: "agent",
        userId: "agent-user",
      };

      const result = await tool.tool.handler(pending.args, context);
      const resultText = `Completed: ${pending.description}\n\nResult: ${JSON.stringify(result, null, 2)}`;

      await this.conversationService.addMessage(
        conversationId,
        "assistant",
        resultText,
      );

      return {
        text: resultText,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        text: `Error executing ${pending.toolName}: ${errorMessage}`,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  /**
   * Convert MCP tools to AI-compatible tool format
   * Filters tools based on user permission level
   */
  private convertMCPToolsToAITools(
    conversationId: string,
    userPermissionLevel: "anchor" | "trusted" | "public",
  ): AITool[] {
    // Get tools filtered by permission level
    const mcpTools =
      this.mcpService.listToolsForPermissionLevel(userPermissionLevel);

    return mcpTools.map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.object(tool.inputSchema),
      execute: async (args: unknown): Promise<unknown> => {
        const context: ToolContext = {
          interfaceType: "agent",
          userId: "agent-user",
          channelId: conversationId,
        };

        this.logger.debug("Executing tool", {
          toolName: tool.name,
          args,
        });

        const result = await tool.handler(args, context);
        return result;
      },
    }));
  }

  /**
   * Build the system prompt from identity and agent instructions
   */
  private buildSystemPrompt(): string {
    const identity = this.identityService.getIdentity();

    return `# ${identity.name}

**Role:** ${identity.role}
**Purpose:** ${identity.purpose}
**Values:** ${identity.values.join(", ")}

## Agent Instructions

You are an AI assistant with access to tools for managing a personal knowledge system.

### Tool Usage
- Use tools when they help answer the user's question
- You can call multiple tools in sequence if needed
- Format tool results in a user-friendly way using markdown

### Destructive Operations
For these operations, ask for confirmation before executing:
- Deleting entities (notes, links, etc.)
- Publishing content
- Modifying system settings

When asking for confirmation, clearly describe what will happen.

### Response Style
- Be concise and helpful
- Use markdown formatting for readability
- If a tool fails, explain the error clearly
- If you don't know something, say so`;
  }
}
