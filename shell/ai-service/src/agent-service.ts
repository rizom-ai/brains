import type { AgentContextItem } from "@brains/contracts";
import { type Logger, getErrorMessage } from "@brains/utils";
import {
  type IMCPService,
  type ToolContext,
  toolSuccessSchema,
} from "@brains/mcp-service";
import type {
  ConversationMessageActor,
  ConversationMessageMetadata,
  ConversationMessageSource,
  IConversationService,
} from "@brains/conversation-service";
import type {
  IBrainCharacterService,
  IAnchorProfileService,
} from "@brains/identity-service";
import type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  ChatAttachment,
  ChatContext,
  IAgentService,
  StructuredChatCard,
  ToolResultData,
} from "./agent-types";
import type { BrainCallOptions } from "./brain-agent";
import {
  agentMachine,
  emptyUsage,
  type ProcessMessageInput,
  type ExecuteActionInput,
} from "./agent-machine";
import { createActor, fromPromise, waitFor } from "xstate";
import {
  buildAgentContextInstructions,
  buildMessageWithAttachments,
  buildModelMessages,
  resolveConversationUploadContinuity,
} from "./conversation-messages";
import {
  buildAttachmentCardFromToolData,
  buildSourcesCardFromContextItems,
  extractToolResults,
  buildEntityMemoryNote,
} from "./agent-results";
import { buildAssistantActor } from "./assistant-actor";
import { toTokenUsage } from "./generation-options";

/**
 * Default step limit if not specified
 */
const DEFAULT_STEP_LIMIT = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function isFailedToolOutput(value: unknown): boolean {
  return isRecord(value) && value["success"] === false;
}

const INTERNAL_CONFIRMATION_FIELDS = new Set([
  "confirmed",
  "confirmationToken",
  "contentHash",
]);

function toApprovalCardInput(
  args: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(args)) return undefined;
  return Object.fromEntries(
    Object.entries(args).filter(
      ([key]) => !INTERNAL_CONFIRMATION_FIELDS.has(key),
    ),
  );
}

function getSourceArtifactRequestInfo(message: string): {
  referencesArtifact: boolean;
  referencesExistingSource: boolean;
  durableArtifactRequest: boolean;
  deckCarouselPreviewOnly: boolean;
} {
  const normalized = message.toLowerCase();
  const referencesArtifact =
    /\b(carousel|printable|og image|open graph|social preview|preview image|attachment|attach|pdf|document)\b/.test(
      normalized,
    );
  const referencesExistingSource =
    /\b(deck|post|project|product|existing entity|source attachment|source-derived)\b/.test(
      normalized,
    );
  const durableArtifactRequest =
    /\b(save|persist|create|attach|regenerate|replace|set)\b/.test(normalized);
  const deckCarouselPreviewOnly =
    /\b(deck|slides|presentation)\b/.test(normalized) &&
    /\bcarousel\b/.test(normalized) &&
    /\b(preview|render)\b/.test(normalized) &&
    !durableArtifactRequest;

  return {
    referencesArtifact,
    referencesExistingSource,
    durableArtifactRequest,
    deckCarouselPreviewOnly,
  };
}

function shouldEnableCreateSourceAttachment(input: {
  message: string;
  hasAccessibleUploads: boolean;
}): boolean {
  const info = getSourceArtifactRequestInfo(input.message);

  if (info.deckCarouselPreviewOnly) return false;
  if (input.hasAccessibleUploads && !info.referencesExistingSource) {
    return false;
  }
  return info.referencesArtifact;
}

function shouldDisableDocumentGenerate(message: string): boolean {
  const info = getSourceArtifactRequestInfo(message);
  return (
    info.referencesArtifact &&
    info.referencesExistingSource &&
    info.durableArtifactRequest &&
    !info.deckCarouselPreviewOnly
  );
}

function buildAttachmentOnlyResponse(attachments: ChatAttachment[]): string {
  const filenames = attachments.map((attachment) => attachment.filename);
  const fileLabel =
    filenames.length === 1
      ? `\`${filenames[0]}\``
      : filenames.map((filename) => `\`${filename}\``).join(", ");
  return `I got ${fileLabel}. What would you like me to do with ${filenames.length === 1 ? "it" : "these files"}?`;
}

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
  private agentInstructions: AgentConfig["agentInstructions"];
  private assistantActorId: string | undefined;
  private canonicalIdentityResolver: AgentConfig["canonicalIdentityResolver"];
  private agentContextProvider: AgentConfig["agentContextProvider"];

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
    profileService: IAnchorProfileService,
    logger: Logger,
    config: AgentConfig,
  ): AgentService {
    AgentService.instance ??= new AgentService(
      mcpService,
      conversationService,
      identityService,
      profileService,
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
    profileService: IAnchorProfileService,
    logger: Logger,
    config: AgentConfig,
  ): AgentService {
    return new AgentService(
      mcpService,
      conversationService,
      identityService,
      profileService,
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
    private profileService: IAnchorProfileService,
    logger: Logger,
    config: AgentConfig,
  ) {
    this.logger = logger.child("AgentService");
    this.stepLimit = config.stepLimit ?? DEFAULT_STEP_LIMIT;
    this.agentFactory = config.agentFactory;
    this.agentInstructions = config.agentInstructions;
    this.assistantActorId = config.assistantActorId;
    this.canonicalIdentityResolver = config.canonicalIdentityResolver;
    this.agentContextProvider = config.agentContextProvider;
  }

  /**
   * Get or create the BrainAgent instance
   * Lazy initialization allows tools to be registered after service creation
   */
  private getAgent(): BrainAgent {
    this.agent ??= this.agentFactory({
      identity: this.identityService.getCharacter(),
      profile: this.profileService.getProfile(),
      tools: this.mcpService.listTools().map((t) => t.tool),
      pluginInstructions: this.mcpService.getInstructions(),
      ...(this.agentInstructions && {
        agentInstructions: this.agentInstructions,
      }),
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
      actor: context?.actor ?? null,
      source: context?.source ?? null,
      attachments: context?.attachments ?? [],
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
   * Confirm or cancel a pending approval-gated action
   */
  public async confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
    approvalId: string,
  ): Promise<AgentResponse> {
    const actor = this.conversationActors.get(conversationId);
    if (!actor) {
      return {
        text: "No pending action to confirm.",
        usage: emptyUsage,
      };
    }

    const snapshotBeforeConfirm = actor.getSnapshot();

    if (!snapshotBeforeConfirm.matches("awaitingConfirmation")) {
      return {
        text: "No pending action to confirm.",
        usage: emptyUsage,
      };
    }

    const matchesApproval =
      snapshotBeforeConfirm.context.pendingConfirmations.some(
        (confirmation) => confirmation.id === approvalId,
      );
    if (!matchesApproval) {
      return {
        text: `No pending action matches approval id '${approvalId}'.`,
        usage: emptyUsage,
      };
    }

    actor.send({
      type: confirmed ? "CONFIRM" : "CANCEL",
      approvalId,
    });

    const snapshot = await waitFor(
      actor,
      (s) =>
        (s.matches("idle") || s.matches("awaitingConfirmation")) &&
        !s.context.pendingConfirmations.some(
          (confirmation) => confirmation.id === approvalId,
        ),
    );

    return (
      snapshot.context.response ?? {
        text: "Action completed.",
        usage: emptyUsage,
      }
    );
  }

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
      actor,
      source,
      attachments,
    } = input;

    // Ensure conversation exists
    await this.conversationService.startConversation({
      sessionId: conversationId,
      interfaceType,
      channelId,
      metadata: { channelName, interfaceType, channelId },
    });

    if (message.trim().length === 0 && attachments.length > 0) {
      await this.conversationService.addMessage({
        conversationId,
        role: "user",
        content: message,
        ...this.withMessageMetadata(
          this.buildMessageMetadata(actor, source, attachments),
        ),
      });

      const responseText = buildAttachmentOnlyResponse(attachments);
      await this.conversationService.addMessage({
        conversationId,
        role: "assistant",
        content: responseText,
        ...this.withMessageMetadata(
          this.buildMessageMetadata(
            this.getAssistantActor(),
            this.buildAssistantSource(channelId, channelName),
          ),
        ),
      });

      return {
        text: responseText,
        toolResults: [],
        usage: emptyUsage,
      };
    }

    // Load conversation history
    const historyMessages = await this.conversationService.getMessages(
      conversationId,
      { limit: 50 },
    );

    const uploadContinuity = resolveConversationUploadContinuity({
      message,
      currentAttachments: attachments,
      historyMessages,
    });

    const effectiveMessage = uploadContinuity.message;
    const effectiveAttachments = uploadContinuity.attachments;
    const contextItems = await this.fetchAgentContext({
      conversationId,
      message: effectiveMessage,
      interfaceType,
      channelId,
      channelName,
      userPermissionLevel,
    });

    const modelMessage = buildMessageWithAttachments(
      effectiveMessage,
      effectiveAttachments,
      {
        uploadRefs: uploadContinuity.refs,
      },
    );
    const messages = buildModelMessages(historyMessages, modelMessage);
    const agentContextInstructions =
      buildAgentContextInstructions(contextItems);

    // Log available tools
    const tools = this.mcpService
      .listToolsForPermissionLevel(userPermissionLevel)
      .map((t) => t.tool.name);
    this.logger.debug("Available tools for this call", {
      toolCount: tools.length,
      tools,
    });

    // Save user message
    await this.conversationService.addMessage({
      conversationId,
      role: "user",
      content: effectiveMessage,
      ...this.withMessageMetadata(
        this.buildMessageMetadata(actor, source, effectiveAttachments),
      ),
    });

    // Call agent
    const hasCurrentUploadAttachments = effectiveAttachments.some(
      (attachment) => attachment.source !== undefined,
    );
    const hasAccessibleUploads =
      hasCurrentUploadAttachments || uploadContinuity.refs.length > 0;
    const enableCreateSourceAttachment = shouldEnableCreateSourceAttachment({
      message,
      hasAccessibleUploads,
    });
    const disableDocumentGenerate = shouldDisableDocumentGenerate(message);
    const callOptions: BrainCallOptions = {
      userPermissionLevel,
      conversationId,
      channelId,
      channelName,
      interfaceType,
      ...(hasAccessibleUploads
        ? { enableCreateUpload: true, enableCreateTransform: true }
        : {}),
      ...(enableCreateSourceAttachment
        ? { enableCreateSourceAttachment: true }
        : {}),
      ...(disableDocumentGenerate ? { disableDocumentGenerate: true } : {}),
      ...(agentContextInstructions ? { agentContextInstructions } : {}),
    };

    const result = await this.getAgent().generate({
      messages,
      options: callOptions,
    });

    const { toolResults, pendingConfirmations, cards, totalToolCalls } =
      extractToolResults(result.steps);
    const sourcesCard = buildSourcesCardFromContextItems(contextItems);
    const responseCards = sourcesCard ? [...cards, sourcesCard] : cards;

    const responseText =
      pendingConfirmations.length > 0 ? "Confirmation required." : result.text;
    const entityMemoryNote =
      pendingConfirmations.length > 0 ? "" : buildEntityMemoryNote(toolResults);

    // Save assistant response. When a tool requires confirmation, do not save
    // potentially misleading model completion text (e.g. "Deleted.") before
    // the action has actually been confirmed and executed.
    //
    // Store a memory note of entities this turn created/updated so their IDs
    // stay addressable next turn. The note is injected into model history from
    // metadata only; visible assistant content stays clean.
    if (responseText.trim()) {
      await this.conversationService.addMessage({
        conversationId,
        role: "assistant",
        content: responseText,
        ...this.withMessageMetadata(
          this.buildMessageMetadata(
            this.getAssistantActor(),
            this.buildAssistantSource(channelId, channelName),
            [],
            responseCards,
            entityMemoryNote,
          ),
        ),
      });
    }

    this.logger.debug("Chat completed", {
      conversationId,
      responseLength: responseText.length,
      toolCalls: totalToolCalls,
      stepCount: result.steps.length,
      usage: result.usage,
    });

    const response: AgentResponse = {
      text: responseText,
      toolResults,
      ...(responseCards.length > 0 ? { cards: responseCards } : {}),
      usage: toTokenUsage(result.usage),
    };

    if (pendingConfirmations.length > 0) {
      response.pendingConfirmations = pendingConfirmations;
    }

    return response;
  }

  private async fetchAgentContext(params: {
    conversationId: string;
    message: string;
    interfaceType: string;
    channelId: string;
    channelName: string;
    userPermissionLevel: ChatContext["userPermissionLevel"];
  }): Promise<AgentContextItem[] | undefined> {
    if (!this.agentContextProvider) return undefined;

    try {
      return await this.agentContextProvider({
        conversationId: params.conversationId,
        message: params.message,
        interfaceType: params.interfaceType,
        channelId: params.channelId,
        channelName: params.channelName,
        userPermissionLevel: params.userPermissionLevel ?? "public",
      });
    } catch (error) {
      this.logger.warn("Agent context provider failed", {
        conversationId: params.conversationId,
        error: getErrorMessage(error),
      });
      return undefined;
    }
  }

  private async executeConfirmedAction(
    input: ExecuteActionInput,
  ): Promise<AgentResponse> {
    const {
      conversationId,
      pendingConfirmation,
      interfaceType,
      channelId,
      channelName,
      userPermissionLevel,
    } = input;

    const tools =
      this.mcpService.listToolsForPermissionLevel(userPermissionLevel);
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
      interfaceType,
      userId: "agent-user",
      conversationId,
      channelId,
      channelName,
      userPermissionLevel,
    };

    const result = await tool.tool.handler(pendingConfirmation.args, context);
    const failed = isFailedToolOutput(result);
    const prefix = failed ? "Failed" : "Completed";
    const errorMessage = failed
      ? (getStringField(result, "error") ?? getStringField(result, "message"))
      : undefined;
    const resultText = errorMessage
      ? `${prefix}: ${pendingConfirmation.summary}\n\n${errorMessage}`
      : `${prefix}: ${pendingConfirmation.summary}`;
    const toolResult: ToolResultData = {
      toolName: pendingConfirmation.toolName,
      data: result,
      ...(isRecord(pendingConfirmation.args)
        ? { args: pendingConfirmation.args }
        : {}),
    };
    const approvalInput = toApprovalCardInput(pendingConfirmation.args);
    const approvalCard: StructuredChatCard = {
      kind: "tool-approval",
      id: pendingConfirmation.id,
      ...(pendingConfirmation.toolCallId
        ? { toolCallId: pendingConfirmation.toolCallId }
        : {}),
      toolName: pendingConfirmation.toolName,
      ...(approvalInput ? { input: approvalInput } : {}),
      summary: pendingConfirmation.summary,
      state: failed ? "output-error" : "output-available",
      output: result,
      ...(failed
        ? { error: getStringField(result, "error") ?? "Action failed" }
        : {}),
    };
    const successResult = toolSuccessSchema.safeParse(result);
    const attachmentCard = successResult.success
      ? buildAttachmentCardFromToolData(successResult.data.data)
      : undefined;
    const cards: StructuredChatCard[] = [
      approvalCard,
      ...(attachmentCard ? [attachmentCard] : []),
    ];
    const entityMemoryNote = successResult.success
      ? buildEntityMemoryNote([
          {
            ...toolResult,
            data: successResult.data.data,
          },
        ])
      : "";

    await this.conversationService.addMessage({
      conversationId,
      role: "assistant",
      content: resultText,
      ...this.withMessageMetadata(
        this.buildMessageMetadata(
          this.getAssistantActor(),
          this.buildAssistantSource(channelId, channelName),
          [],
          cards,
          entityMemoryNote,
        ),
      ),
    });

    return {
      text: resultText,
      toolResults: [toolResult],
      cards,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  private buildMessageMetadata(
    actor: ConversationMessageActor | null,
    source: ConversationMessageSource | null,
    attachments: ChatAttachment[] = [],
    cards: StructuredChatCard[] = [],
    entityMemoryNote = "",
  ): ConversationMessageMetadata {
    const enrichedActor = actor
      ? (this.canonicalIdentityResolver?.enrichActor(actor) ?? actor)
      : null;
    return {
      ...(enrichedActor ? { actor: enrichedActor } : {}),
      ...(source ? { source } : {}),
      ...(attachments.length > 0
        ? {
            attachments: attachments.map((attachment) =>
              this.toMessageAttachmentMetadata(attachment),
            ),
          }
        : {}),
      ...(cards.length > 0 ? { cards } : {}),
      ...(entityMemoryNote.length > 0 ? { entityMemoryNote } : {}),
    };
  }

  private toMessageAttachmentMetadata(
    attachment: ChatAttachment,
  ): Record<string, unknown> {
    return {
      kind: attachment.kind,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      ...(attachment.sizeBytes !== undefined && {
        sizeBytes: attachment.sizeBytes,
      }),
      ...(attachment.source !== undefined && { source: attachment.source }),
    };
  }

  private withMessageMetadata(
    metadata: ConversationMessageMetadata,
  ): { metadata: Record<string, unknown> } | Record<string, never> {
    return Object.keys(metadata).length > 0 ? { metadata } : {};
  }

  private getAssistantActor(): ConversationMessageActor {
    return buildAssistantActor({
      character: this.identityService.getCharacter(),
      ...(this.assistantActorId ? { actorId: this.assistantActorId } : {}),
    });
  }

  private buildAssistantSource(
    channelId: string,
    channelName: string,
  ): ConversationMessageSource {
    return {
      channelId,
      channelName,
    };
  }
}
