import type { AgentContextItem } from "@brains/contracts";
import { type Logger, getErrorMessage } from "@brains/utils";
import type { IMCPService, ToolContext } from "@brains/mcp-service";
import { PermissionService } from "@brains/templates";
import type {
  ConversationMessageActor,
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
} from "./agent-types";
import {
  agentMachine,
  emptyUsage,
  type ProcessMessageInput,
  type ExecuteActionInput,
  type RuntimePendingConfirmation,
  type AgentMachineContext,
} from "./agent-machine";
import { createActor, fromPromise, waitFor } from "xstate";
import {
  buildAgentContextInstructions,
  buildMessageWithAttachments,
  buildModelMessages,
  resolveConversationUploadContinuity,
  shouldHydrateUploadAttachmentsForMessage,
  type ConversationUploadRef,
} from "./conversation-messages";
import {
  buildSourcesCardFromContextItems,
  extractToolResults,
  buildEntityMemoryNote,
} from "./agent-results";
import { buildAssistantActor } from "./assistant-actor";
import { buildBrainCallOptions } from "./call-options";
import { buildConfirmedActionResult } from "./confirmed-action";
import { buildMessageMetadata, withMessageMetadata } from "./message-metadata";
import { toTokenUsage } from "./generation-options";

/**
 * Default step limit if not specified
 */
const DEFAULT_STEP_LIMIT = 10;

function buildAttachmentOnlyResponse(attachments: ChatAttachment[]): string {
  const filenames = attachments.map((attachment) => attachment.filename);
  const fileLabel =
    filenames.length === 1
      ? `\`${filenames[0]}\``
      : filenames.map((filename) => `\`${filename}\``).join(", ");
  return `I got ${fileLabel}. What would you like me to do with ${filenames.length === 1 ? "it" : "these files"}?`;
}

function isImageAttachment(attachment: ChatAttachment): boolean {
  return attachment.mediaType.startsWith("image/");
}

function isPdfAttachment(attachment: ChatAttachment): boolean {
  return attachment.mediaType === "application/pdf";
}

function isTextAttachment(attachment: ChatAttachment): boolean {
  return attachment.kind === "text" || attachment.mediaType.startsWith("text/");
}

function buildAttachmentOnlyActionsCard(
  attachments: ChatAttachment[],
): StructuredChatCard | undefined {
  if (attachments.length === 0) return undefined;

  if (attachments.length > 1) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "summarize-uploads",
          label: "Summarize uploads",
          prompt: "Summarize the uploaded files.",
        },
      ],
    };
  }

  const [attachment] = attachments;
  if (attachment === undefined) return undefined;

  if (isImageAttachment(attachment)) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "describe-image",
          label: "Describe image",
          prompt: "Describe the uploaded image.",
        },
        {
          type: "prompt",
          id: "save-image",
          label: "Save image",
          prompt: "Save the uploaded image.",
        },
      ],
    };
  }

  if (isPdfAttachment(attachment)) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "summarize-pdf",
          label: "Summarize PDF",
          prompt: "Summarize the uploaded PDF.",
        },
        {
          type: "prompt",
          id: "save-document",
          label: "Save document",
          prompt: "Save the uploaded PDF as a document.",
        },
      ],
    };
  }

  if (isTextAttachment(attachment)) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "summarize-upload",
          label: "Summarize upload",
          prompt: "Summarize the uploaded file.",
        },
        {
          type: "prompt",
          id: "save-upload-note",
          label: "Save as note",
          prompt: "Save the uploaded file as a note.",
        },
      ],
    };
  }

  return {
    kind: "actions",
    id: "actions:upload-intent",
    title: "Try next",
    defaultOpen: true,
    actions: [
      {
        type: "prompt",
        id: "summarize-upload",
        label: "Summarize upload",
        prompt: "Summarize the uploaded file.",
      },
    ],
  };
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
  private mcpService: IMCPService;
  private conversationService: IConversationService;
  private identityService: IBrainCharacterService;
  private profileService: IAnchorProfileService;
  private static instance: AgentService | null = null;
  private logger: Logger;
  private stepLimit: number;
  private agentFactory: AgentConfig["agentFactory"];
  private agentInstructions: AgentConfig["agentInstructions"];
  private assistantActorId: string | undefined;
  private canonicalIdentityResolver: AgentConfig["canonicalIdentityResolver"];
  private agentContextProvider: AgentConfig["agentContextProvider"];
  private uploadAttachmentResolver: AgentConfig["uploadAttachmentResolver"];

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
    mcpService: IMCPService,
    conversationService: IConversationService,
    identityService: IBrainCharacterService,
    profileService: IAnchorProfileService,
    logger: Logger,
    config: AgentConfig,
  ) {
    this.mcpService = mcpService;
    this.conversationService = conversationService;
    this.identityService = identityService;
    this.profileService = profileService;
    this.logger = logger.child("AgentService");
    this.stepLimit = config.stepLimit ?? DEFAULT_STEP_LIMIT;
    this.agentFactory = config.agentFactory;
    this.agentInstructions = config.agentInstructions;
    this.assistantActorId = config.assistantActorId;
    this.canonicalIdentityResolver = config.canonicalIdentityResolver;
    this.agentContextProvider = config.agentContextProvider;
    this.uploadAttachmentResolver = config.uploadAttachmentResolver;
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
    context: ChatContext,
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

    const pendingConfirmation =
      snapshotBeforeConfirm.context.pendingConfirmations.find(
        (confirmation) => confirmation.id === approvalId,
      ) ?? null;
    if (!pendingConfirmation) {
      return {
        text: `No pending action matches approval id '${approvalId}'.`,
        usage: emptyUsage,
      };
    }

    const confirmationContext = this.resolveConfirmationContext(
      context,
      snapshotBeforeConfirm.context,
    );
    if (!confirmationContext) {
      return {
        text: "Confirmation requires caller context.",
        usage: emptyUsage,
      };
    }

    if (
      !this.canConfirmPendingAction(pendingConfirmation, confirmationContext)
    ) {
      return {
        text: "You are not authorized to confirm this pending action.",
        pendingConfirmations:
          snapshotBeforeConfirm.context.pendingConfirmations,
        usage: emptyUsage,
      };
    }

    actor.send({
      type: confirmed ? "CONFIRM" : "CANCEL",
      approvalId,
      interfaceType: confirmationContext.interfaceType,
      channelId: confirmationContext.channelId,
      channelName: confirmationContext.channelName,
      userPermissionLevel: confirmationContext.userPermissionLevel,
      actor: confirmationContext.actor,
      source: confirmationContext.source,
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

  private resolveConfirmationContext(
    context: ChatContext | undefined,
    previousContext: AgentMachineContext,
  ): {
    interfaceType: string;
    channelId: string;
    channelName: string;
    userPermissionLevel: NonNullable<ChatContext["userPermissionLevel"]>;
    actor: ConversationMessageActor | null;
    source: ConversationMessageSource | null;
  } | null {
    if (!context?.userPermissionLevel) return null;

    return {
      interfaceType: context.interfaceType ?? previousContext.interfaceType,
      channelId: context.channelId ?? previousContext.channelId,
      channelName: context.channelName ?? previousContext.channelName,
      userPermissionLevel: context.userPermissionLevel,
      actor: context.actor ?? null,
      source: context.source ?? null,
    };
  }

  private canConfirmPendingAction(
    pendingConfirmation: RuntimePendingConfirmation,
    context: {
      userPermissionLevel: NonNullable<ChatContext["userPermissionLevel"]>;
      actor: ConversationMessageActor | null;
    },
  ): boolean {
    if (context.userPermissionLevel === "anchor") return true;

    const requesterActorKey = pendingConfirmation.requester.actorKey;
    if (requesterActorKey) {
      const callerActorKey = this.actorKey(context.actor);
      if (callerActorKey !== requesterActorKey) return false;
    }

    return PermissionService.hasPermission(
      context.userPermissionLevel,
      pendingConfirmation.requester.userPermissionLevel,
    );
  }

  private actorKey(
    actor: ConversationMessageActor | null | undefined,
  ): string | undefined {
    return actor?.canonicalId ?? actor?.actorId;
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
        ...this.messageMetadata({ actor, source, attachments }),
      });

      const responseText = buildAttachmentOnlyResponse(attachments);
      const actionsCard = buildAttachmentOnlyActionsCard(attachments);
      const responseCards = actionsCard ? [actionsCard] : [];
      await this.conversationService.addMessage({
        conversationId,
        role: "assistant",
        content: responseText,
        ...this.messageMetadata({
          actor: this.getAssistantActor(),
          source: this.buildAssistantSource(channelId, channelName),
          cards: responseCards,
        }),
      });

      return {
        text: responseText,
        toolResults: [],
        ...(responseCards.length > 0 ? { cards: responseCards } : {}),
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
    const liveUploadRefs = await this.filterLiveUploadRefs(
      uploadContinuity.refs,
    );

    const effectiveMessage = uploadContinuity.message;
    const effectiveAttachments = await this.hydrateUploadAttachments({
      message: effectiveMessage,
      currentAttachments: uploadContinuity.attachments,
      uploadRefs: liveUploadRefs,
    });
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
        uploadRefs: liveUploadRefs,
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
      ...this.messageMetadata({
        actor,
        source,
        attachments: effectiveAttachments,
      }),
    });

    // Call agent
    const hasCurrentUploadAttachments = effectiveAttachments.some(
      (attachment) => attachment.source !== undefined,
    );
    const hasAccessibleUploads =
      hasCurrentUploadAttachments || liveUploadRefs.length > 0;
    const callOptions = buildBrainCallOptions({
      message,
      hasAccessibleUploads,
      userPermissionLevel,
      conversationId,
      channelId,
      channelName,
      interfaceType,
      ...(agentContextInstructions ? { agentContextInstructions } : {}),
    });

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
        ...this.messageMetadata({
          actor: this.getAssistantActor(),
          source: this.buildAssistantSource(channelId, channelName),
          cards: responseCards,
          entityMemoryNote,
        }),
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

  private async filterLiveUploadRefs(
    refs: ConversationUploadRef[],
  ): Promise<ConversationUploadRef[]> {
    if (refs.length === 0) return [];
    if (!this.uploadAttachmentResolver) return [];

    const liveRefs: ConversationUploadRef[] = [];
    for (const ref of refs) {
      try {
        const attachment = await this.uploadAttachmentResolver(ref.source);
        if (!attachment) continue;
        liveRefs.push({
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          source: ref.source,
        });
      } catch (error) {
        this.logger.debug("Skipped unavailable prior upload ref", {
          uploadKind: ref.source.kind,
          uploadId: ref.source.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return liveRefs;
  }

  private async hydrateUploadAttachments(params: {
    message: string;
    currentAttachments: ChatAttachment[];
    uploadRefs: { source: NonNullable<ChatAttachment["source"]> }[];
  }): Promise<ChatAttachment[]> {
    if (params.currentAttachments.length > 0) return params.currentAttachments;
    if (!this.uploadAttachmentResolver) return params.currentAttachments;
    if (params.uploadRefs.length !== 1) return params.currentAttachments;
    if (!shouldHydrateUploadAttachmentsForMessage(params.message)) {
      return params.currentAttachments;
    }

    const hydrated: ChatAttachment[] = [];
    for (const ref of params.uploadRefs.slice().reverse()) {
      try {
        const attachment = await this.uploadAttachmentResolver(ref.source);
        if (attachment) hydrated.push(attachment);
      } catch (error) {
        this.logger.debug("Skipped unavailable prior upload attachment", {
          uploadKind: ref.source.kind,
          uploadId: ref.source.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (hydrated.length > 0) break;
    }

    return hydrated.length > 0 ? hydrated : params.currentAttachments;
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
    const outcome = buildConfirmedActionResult(pendingConfirmation, result);

    await this.conversationService.addMessage({
      conversationId,
      role: "assistant",
      content: outcome.resultText,
      ...this.messageMetadata({
        actor: this.getAssistantActor(),
        source: this.buildAssistantSource(channelId, channelName),
        cards: outcome.cards,
        entityMemoryNote: outcome.entityMemoryNote,
      }),
    });

    return {
      text: outcome.resultText,
      toolResults: [outcome.toolResult],
      cards: outcome.cards,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  private messageMetadata(params: {
    actor: ConversationMessageActor | null;
    source: ConversationMessageSource | null;
    attachments?: ChatAttachment[];
    cards?: StructuredChatCard[];
    entityMemoryNote?: string;
  }): { metadata: Record<string, unknown> } | Record<string, never> {
    return withMessageMetadata(
      buildMessageMetadata({
        ...params,
        ...(this.canonicalIdentityResolver
          ? { canonicalIdentityResolver: this.canonicalIdentityResolver }
          : {}),
      }),
    );
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
