import { type Logger } from "@brains/utils";
import { type IMCPService, type ToolContext } from "@brains/mcp-service";
import type { IConversationService } from "@brains/conversation-service";
import type { IBrainCharacterService } from "@brains/identity-service";
import type { ModelMessage } from "ai";
import type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  ChatContext,
  IAgentService,
} from "./agent-types";
import type { BrainCallOptions } from "./brain-agent";
import {
  agentMachine,
  emptyUsage,
  extractToolResults,
  type ProcessMessageInput,
  type ExecuteActionInput,
} from "./agent-machine";
import { createActor, fromPromise, waitFor } from "xstate";

/**
 * Default step limit if not specified
 */
const DEFAULT_STEP_LIMIT = 10;

/**
 * Agent Service - Orchestrates AI-powered conversations with tool access
 *
 * Uses an xstate state machine to model conversation flow:
 * idle → processing → (awaitingConfirmation → executing →) idle
 *
 * Each conversation gets its own machine actor for independent state tracking.
 */
type ConversationActor = ReturnType<typeof createActor<typeof agentMachine>>;

export class AgentService implements IAgentService {
  private static instance: AgentService | null = null;
  private logger: Logger;
  private stepLimit: number;
  private agentFactory: AgentConfig["agentFactory"];

  // Provided machine with injected actors (created once, reused per conversation)
  private providedMachine = agentMachine.provide({
    actors: {
      processMessage: fromPromise<AgentResponse, ProcessMessageInput>(
        async ({ input }) => this.processMessage(input),
      ),
      executeConfirmedAction: fromPromise<AgentResponse, ExecuteActionInput>(
        async ({ input }) => this.executeConfirmedAction(input),
      ),
    },
  });

  // Per-conversation machine actors
  private conversationActors = new Map<string, ConversationActor>();

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
    if (AgentService.instance) {
      for (const actor of AgentService.instance.conversationActors.values()) {
        actor.stop();
      }
      AgentService.instance.conversationActors.clear();
    }
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
   * Get or create the BrainAgent instance
   * Lazy initialization allows tools to be registered after service creation
   */
  private getAgent(): BrainAgent {
    this.agent ??= this.agentFactory({
      identity: this.identityService.getCharacter(),
      tools: this.mcpService.listTools().map((t) => t.tool),
      pluginInstructions: this.mcpService.getPluginInstructions(),
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
   * Get or create a machine actor for a conversation
   */
  private getConversationActor(conversationId: string): ConversationActor {
    let actor = this.conversationActors.get(conversationId);
    if (!actor) {
      actor = createActor(this.providedMachine);
      actor.start();
      this.conversationActors.set(conversationId, actor);
    }
    return actor;
  }

  /**
   * Send a message to the agent and get a response
   */
  public async chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
  ): Promise<AgentResponse> {
    const userPermissionLevel = context?.userPermissionLevel ?? "public";
    const interfaceType = context?.interfaceType ?? "agent";
    const channelId = context?.channelId ?? conversationId;
    const channelName = context?.channelName ?? channelId;

    this.logger.debug("Processing chat message", {
      conversationId,
      messageLength: message.length,
      userPermissionLevel,
    });

    const actor = this.getConversationActor(conversationId);

    actor.send({
      type: "RECEIVE_MESSAGE",
      message,
      conversationId,
      interfaceType,
      channelId,
      channelName,
      userPermissionLevel,
    });

    const snapshot = await waitFor(
      actor,
      (s) => s.matches("idle") || s.matches("awaitingConfirmation"),
    );

    return (
      snapshot.context.response ?? {
        text: "No response generated.",
        usage: emptyUsage,
      }
    );
  }

  /**
   * Confirm or cancel a pending destructive operation
   */
  public async confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
  ): Promise<AgentResponse> {
    const actor = this.conversationActors.get(conversationId);

    if (!actor?.getSnapshot().matches("awaitingConfirmation")) {
      return {
        text: "No pending action to confirm.",
        usage: emptyUsage,
      };
    }

    actor.send({ type: confirmed ? "CONFIRM" : "CANCEL" });

    const snapshot = await waitFor(actor, (s) => s.matches("idle"));

    return (
      snapshot.context.response ?? {
        text: "Action completed.",
        usage: emptyUsage,
      }
    );
  }

  /**
   * Process a message through the AI agent.
   * This is the core logic previously in chat() — now an actor for the machine.
   */
  private async processMessage(
    input: ProcessMessageInput,
  ): Promise<AgentResponse> {
    const {
      conversationId,
      message,
      interfaceType,
      channelId,
      channelName,
      userPermissionLevel,
    } = input;

    // Ensure conversation exists
    await this.conversationService.startConversation(
      conversationId,
      interfaceType,
      channelId,
      { channelName, interfaceType, channelId },
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
      return { role: "system", content: msg.content };
    });

    messages.push({ role: "user", content: message });

    // Log available tools
    const tools = this.mcpService
      .listToolsForPermissionLevel(userPermissionLevel)
      .map((t) => t.tool.name);
    this.logger.debug("Available tools for this call", {
      toolCount: tools.length,
      tools,
    });

    // Save user message
    await this.conversationService.addMessage(conversationId, "user", message);

    // Call agent
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

    // Save assistant response
    if (result.text.trim()) {
      await this.conversationService.addMessage(
        conversationId,
        "assistant",
        result.text,
      );
    }

    const { toolResults, pendingConfirmation, totalToolCalls } =
      extractToolResults(result.steps);

    this.logger.debug("Chat completed", {
      conversationId,
      responseLength: result.text.length,
      toolCalls: totalToolCalls,
      stepCount: result.steps.length,
      usage: result.usage,
    });

    const response: AgentResponse = {
      text: result.text,
      toolResults,
      usage: {
        promptTokens: result.usage.inputTokens ?? 0,
        completionTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
    };

    if (pendingConfirmation) {
      response.pendingConfirmation = pendingConfirmation;
    }

    return response;
  }

  /**
   * Execute a confirmed destructive action.
   * Actor for the machine's "executing" state.
   */
  private async executeConfirmedAction(
    input: ExecuteActionInput,
  ): Promise<AgentResponse> {
    const { conversationId, pendingConfirmation } = input;

    const tools = this.mcpService.listTools();
    const tool = tools.find(
      (t) => t.tool.name === pendingConfirmation.toolName,
    );

    if (!tool) {
      return {
        text: `Error: Tool '${pendingConfirmation.toolName}' not found.`,
        usage: emptyUsage,
      };
    }

    const context: ToolContext = {
      interfaceType: "agent",
      userId: "agent-user",
    };

    const result = await tool.tool.handler(pendingConfirmation.args, context);
    const resultText = `Completed: ${pendingConfirmation.description}\n\nResult: ${JSON.stringify(result, null, 2)}`;

    await this.conversationService.addMessage(
      conversationId,
      "assistant",
      resultText,
    );

    return {
      text: resultText,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}
