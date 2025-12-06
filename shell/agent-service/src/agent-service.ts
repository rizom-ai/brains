import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type { IAIService, AITool, AIMessage } from "@brains/ai-service";
import {
  type IMCPService,
  type ToolContext,
  toolResponseSchema,
} from "@brains/mcp-service";
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
    const interfaceType = context?.interfaceType ?? "agent";
    const channelId = context?.channelId ?? conversationId;

    this.logger.debug("Processing chat message", {
      conversationId,
      messageLength: message.length,
      userPermissionLevel,
    });

    // Ensure conversation exists (creates if needed)
    // channelName defaults to channelId if not provided
    const channelName = context?.channelName ?? channelId;
    await this.conversationService.startConversation(
      conversationId,
      interfaceType,
      channelId,
      {
        channelName,
        interfaceType,
        channelId,
      },
    );

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

    this.logger.debug("Tools available for chat", {
      toolCount: tools.length,
      userPermissionLevel,
    });

    // Build system prompt with user context
    const systemPrompt = this.buildSystemPrompt(userPermissionLevel);

    // Save user message to conversation
    await this.conversationService.addMessage(conversationId, "user", message);

    // Call AI with tools
    const result = await this.aiService.generateWithTools({
      system: systemPrompt,
      messages,
      tools,
      maxSteps: this.config.maxSteps,
    });

    // Save assistant response to conversation (only if non-empty)
    // Empty text happens when AI only does tool calls without a final response
    if (result.text.trim()) {
      await this.conversationService.addMessage(
        conversationId,
        "assistant",
        result.text,
      );
    }

    // Map tool calls to ToolResultData
    const toolResults = result.toolCalls
      .filter((tc) => tc.result !== null) // Skip null results
      .map((tc) => {
        const parsed = toolResponseSchema.safeParse(tc.result);
        if (!parsed.success) {
          this.logger.warn("Tool result failed validation", {
            toolName: tc.name,
            error: parsed.error.message,
          });
          return {
            toolName: tc.name,
            formatted: `_Tool ${tc.name} completed_`,
          };
        }
        return {
          toolName: tc.name,
          formatted: parsed.data.formatted,
        };
      });

    this.logger.debug("Chat completed", {
      conversationId,
      responseLength: result.text.length,
      toolCalls: result.toolCalls.length,
      usage: result.usage,
    });

    return {
      text: result.text,
      toolResults,
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
  private buildSystemPrompt(
    userPermissionLevel: "anchor" | "trusted" | "public",
  ): string {
    const identity = this.identityService.getIdentity();

    // Build user context section based on permission level
    let userContext = "";
    if (userPermissionLevel === "anchor") {
      userContext = `
## Current User
**You are speaking with your ANCHOR (owner).** This is the person who created and manages you.
Address them personally and recognize that they know you well. Use \`system_get-profile\`
to get their name and details if needed.`;
    } else if (userPermissionLevel === "trusted") {
      userContext = `
## Current User
You are speaking with a **trusted user** who has elevated access but is not the owner.`;
    } else {
      userContext = `
## Current User
You are speaking with a **public user** with limited access.`;
    }

    return `# ${identity.name}

**Role:** ${identity.role}
**Purpose:** ${identity.purpose}
**Values:** ${identity.values.join(", ")}
${userContext}

## Agent Instructions

You are an AI assistant with access to tools for managing a personal knowledge system.

### Identity vs Profile
- **Identity** (from \`system_get-identity\`): This is YOU - the brain's persona, role, purpose, and values
- **Profile** (from \`system_get-profile\`): This is your ANCHOR - the person who owns and manages this brain
- When someone asks "who are you?" → use identity (describe yourself as the brain)
- When someone asks "who owns this?" → use profile (describe your anchor/owner)
- When your anchor is talking to you, address them personally (they created you!)

### Tool Usage
- **ALWAYS use your available tools** - you have many tools, USE THEM proactively
- Look at the tool names: they tell you what they do (e.g., *_list, *_get, *_search)
- **Never claim you don't have access** - if a tool exists for something, use it immediately
- Never say "I don't know" or "I don't have access" without first trying the appropriate tool
- You can call multiple tools in sequence if needed
- Show the formatted output from tools directly to users

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
