import { z, type Logger } from "@brains/utils";
import {
  type IMCPService,
  type ToolContext,
  toolResponseSchema,
} from "@brains/mcp-service";
import type { IConversationService } from "@brains/conversation-service";
import type { IBrainCharacterService } from "@brains/identity-service";
import type { ModelMessage } from "ai";
import type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  ChatContext,
  IAgentService,
  PendingConfirmation,
  ToolResultData,
} from "./agent-types";
import type { BrainCallOptions } from "./brain-agent";

/**
 * Default step limit if not specified
 */
const DEFAULT_STEP_LIMIT = 10;

/**
 * Agent Service - Orchestrates AI-powered conversations with tool access
 *
 * This service:
 * - Receives user messages and sends them to the AI with available tools
 * - Loads conversation history from ConversationService
 * - Uses ToolLoopAgent for automatic tool loop orchestration
 * - Handles confirmation flows for destructive operations
 */
export class AgentService implements IAgentService {
  private static instance: AgentService | null = null;
  private logger: Logger;
  private stepLimit: number;
  private agentFactory: AgentConfig["agentFactory"];

  // Track pending confirmations per conversation
  private pendingConfirmations = new Map<string, PendingConfirmation>();

  // Lazy-initialized agent
  private agent: BrainAgent | null = null;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    mcpService: IMCPService,
    conversationService: IConversationService,
    identityService: IBrainCharacterService,
    logger: Logger,
    config: AgentConfig,
  ): AgentService {
    AgentService.instance ??= new AgentService(
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
    mcpService: IMCPService,
    conversationService: IConversationService,
    identityService: IBrainCharacterService,
    logger: Logger,
    config: AgentConfig,
  ): AgentService {
    return new AgentService(
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
    private mcpService: IMCPService,
    private conversationService: IConversationService,
    private identityService: IBrainCharacterService,
    logger: Logger,
    config: AgentConfig,
  ) {
    this.logger = logger.child("AgentService");
    this.stepLimit = config.stepLimit ?? DEFAULT_STEP_LIMIT;
    this.agentFactory = config.agentFactory;
  }

  /**
   * Get or create the ToolLoopAgent instance
   * Lazy initialization allows tools to be registered after service creation
   */
  private getAgent(): BrainAgent {
    this.agent ??= this.agentFactory({
      identity: this.identityService.getCharacter(),
      tools: this.mcpService.listTools().map((t) => t.tool),
      stepLimit: this.stepLimit,
      getToolsForPermission: (level) =>
        this.mcpService.listToolsForPermissionLevel(level).map((t) => t.tool),
    });
    return this.agent;
  }

  /**
   * Invalidate the cached agent
   * Call this when tools are registered/unregistered
   */
  public invalidateAgent(): void {
    this.agent = null;
    this.logger.debug("Agent invalidated, will be recreated on next chat");
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

    // Convert to AI SDK message format
    const messages: ModelMessage[] = historyMessages.map((msg) => {
      if (msg.role === "user") {
        return { role: "user", content: msg.content };
      }
      if (msg.role === "assistant") {
        return {
          role: "assistant",
          content: [{ type: "text", text: msg.content }],
        };
      }
      // system messages
      return { role: "system", content: msg.content };
    });

    // Add the new user message
    messages.push({ role: "user", content: message });

    this.logger.debug("Calling agent.generate", {
      messageCount: messages.length,
      userPermissionLevel,
    });

    // Log available tools for debugging
    const tools = this.mcpService
      .listToolsForPermissionLevel(userPermissionLevel)
      .map((t) => t.tool.name);
    this.logger.debug("Available tools for this call", {
      toolCount: tools.length,
      tools,
    });

    // Save user message to conversation
    await this.conversationService.addMessage(conversationId, "user", message);

    // Call agent with type-safe options
    const callOptions: BrainCallOptions = {
      userPermissionLevel,
      conversationId,
      channelId,
      channelName,
      interfaceType,
    };

    const result = await this.getAgent().generate({
      messages,
      options: callOptions,
    });

    // Save assistant response to conversation (only if non-empty)
    if (result.text.trim()) {
      await this.conversationService.addMessage(
        conversationId,
        "assistant",
        result.text,
      );
    }

    // Extract tool results from all steps
    // Include all results that have either formatted output or a jobId (for async jobs)
    const toolResults: ToolResultData[] = [];
    const toolArgsSchema = z.record(z.unknown());
    for (const step of result.steps) {
      // Build a map of toolCallId -> input args for this step
      const toolCallArgsMap = new Map<string, Record<string, unknown>>();
      for (const tc of step.toolCalls) {
        const parsed = toolArgsSchema.safeParse(tc.input);
        if (tc.toolCallId && parsed.success) {
          toolCallArgsMap.set(tc.toolCallId, parsed.data);
        }
      }

      for (const tr of step.toolResults) {
        if (tr.output === null) continue;

        const parsed = toolResponseSchema.safeParse(tr.output);

        // Capture args from the matching tool call
        const args = tr.toolCallId
          ? toolCallArgsMap.get(tr.toolCallId)
          : undefined;

        if (!parsed.success) {
          this.logger.warn("Tool result failed validation", {
            toolName: tr.toolName,
            error: parsed.error.message,
          });
          // Still capture result even for failed validations
          const failedResult: ToolResultData = { toolName: tr.toolName };
          if (args !== undefined) {
            failedResult.args = args;
          }
          toolResults.push(failedResult);
          continue;
        }

        // Build result object
        const toolResult: ToolResultData = { toolName: tr.toolName };
        if (args !== undefined) {
          toolResult.args = args;
        }

        // Extract jobId from data if present (for async job tracking)
        if (parsed.data.success && parsed.data.data != null) {
          toolResult.data = parsed.data.data;
          // Try to extract jobId if data is an object with jobId
          const jobIdSchema = z.object({ jobId: z.string() }).passthrough();
          const jobIdParsed = jobIdSchema.safeParse(parsed.data.data);
          if (jobIdParsed.success) {
            toolResult.jobId = jobIdParsed.data.jobId;
          }
        }

        toolResults.push(toolResult);
      }
    }

    // Count total tool calls
    const totalToolCalls = result.steps.reduce(
      (sum, step) => sum + step.toolCalls.length,
      0,
    );

    // Log step details for debugging
    const stepDetails = result.steps.map((step, i) => ({
      step: i,
      toolCalls: step.toolCalls.map((tc) => tc.toolName),
      toolResults: step.toolResults.length,
    }));

    this.logger.debug("Chat completed", {
      conversationId,
      responseLength: result.text.length,
      toolCalls: totalToolCalls,
      stepCount: result.steps.length,
      stepDetails,
      usage: result.usage,
    });

    return {
      text: result.text,
      toolResults,
      usage: {
        promptTokens: result.usage.inputTokens ?? 0,
        completionTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
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
}
