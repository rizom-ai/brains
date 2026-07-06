/**
 * Turn Processor
 *
 * The implementation behind the agent machine's two invoked actors: a
 * full message turn (history, upload continuity, agent context, model
 * call, persistence) and the execution of a confirmed approval-gated
 * action with its follow-up. AgentService wires these into the machine
 * and stays a thin orchestration façade.
 */

import type { AgentContextItem } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { type Logger } from "@brains/utils/logger";
import type { IMCPService, ToolContext } from "@brains/mcp-service";
import type {
  ConversationMessageActor,
  ConversationMessageSource,
  IConversationService,
} from "@brains/conversation-service";
import type { IBrainCharacterService } from "@brains/identity-service";
import type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  ChatAttachment,
  ChatContext,
  StructuredChatCard,
} from "./agent-types";
import {
  emptyUsage,
  type ProcessMessageInput,
  type ExecuteActionInput,
} from "./agent-machine";
import {
  buildAsyncGenerationFallback,
  buildAttachmentOnlyResponse,
  buildAttachmentOnlyActionsCard,
  filterLiveUploadRefs,
  hydrateUploadAttachments,
} from "./attachment-intake";
import {
  buildAgentContextInstructions,
  buildMessageWithAttachments,
  buildModelMessages,
  resolveConversationUploadContinuity,
} from "./conversation-messages";
import {
  buildSourcesCardFromContextItems,
  extractToolResults,
  buildAgentContactCandidates,
  buildEntityMemoryRefs,
  buildToolResultPromptFallback,
  type AgentContactCandidate,
  type EntityMemoryRef,
} from "./agent-results";
import { buildAssistantActor } from "./assistant-actor";
import { buildBrainCallOptions } from "./call-options";
import { buildConfirmedActionResult } from "./confirmed-action";
import { buildMessageMetadata, withMessageMetadata } from "./message-metadata";
import { toTokenUsage } from "./generation-options";

export interface TurnProcessorDeps {
  logger: Logger;
  conversationService: IConversationService;
  mcpService: IMCPService;
  identityService: IBrainCharacterService;
  /** Lazy agent access so invalidation stays with AgentService. */
  getAgent: () => BrainAgent;
  assistantActorId: string | undefined;
  canonicalIdentityResolver: AgentConfig["canonicalIdentityResolver"];
  agentContextProvider: AgentConfig["agentContextProvider"];
  uploadAttachmentResolver: AgentConfig["uploadAttachmentResolver"];
}

export class TurnProcessor {
  constructor(private readonly deps: TurnProcessorDeps) {}

  public async processMessage(
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

    // Ensure conversation exists. Conversation-service currently requires a
    // channelId for storage compatibility; do not reuse this fallback for tool
    // provenance, where absent channelId must remain absent.
    const storageChannelId = channelId ?? conversationId;
    await this.deps.conversationService.startConversation({
      sessionId: conversationId,
      interfaceType,
      channelId: storageChannelId,
      metadata: {
        channelName,
        interfaceType,
        channelId: storageChannelId,
      },
    });

    if (message.trim().length === 0 && attachments.length > 0) {
      await this.deps.conversationService.addMessage({
        conversationId,
        role: "user",
        content: message,
        ...this.messageMetadata({ actor, source, attachments }),
      });

      const responseText = buildAttachmentOnlyResponse(attachments);
      const actionsCard = buildAttachmentOnlyActionsCard(attachments);
      const responseCards = actionsCard ? [actionsCard] : [];
      await this.deps.conversationService.addMessage({
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
    const historyMessages = await this.deps.conversationService.getMessages(
      conversationId,
      { limit: 50 },
    );

    const uploadContinuity = resolveConversationUploadContinuity({
      message,
      currentAttachments: attachments,
      historyMessages,
    });
    const liveUploadRefs = await filterLiveUploadRefs({
      refs: uploadContinuity.refs,
      resolver: this.deps.uploadAttachmentResolver,
      logger: this.deps.logger,
    });
    const modelUploadRefs = liveUploadRefs;

    const effectiveMessage = uploadContinuity.message;
    const effectiveAttachments = await hydrateUploadAttachments({
      currentAttachments: uploadContinuity.attachments,
      uploadRefs: modelUploadRefs,
      resolver: this.deps.uploadAttachmentResolver,
      logger: this.deps.logger,
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
        uploadRefs: modelUploadRefs,
        ...(uploadContinuity.priorResponseRef
          ? { priorResponseRef: uploadContinuity.priorResponseRef }
          : {}),
      },
    );
    const messages = buildModelMessages(historyMessages, modelMessage);
    const agentContextInstructions =
      buildAgentContextInstructions(contextItems);

    // Log available tools
    const tools = this.deps.mcpService
      .listToolsForPermissionLevel(userPermissionLevel)
      .map((t) => t.tool.name);
    this.deps.logger.debug("Available tools for this call", {
      toolCount: tools.length,
      tools,
    });

    // Save user message
    await this.deps.conversationService.addMessage({
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
      hasCurrentUploadAttachments || modelUploadRefs.length > 0;
    const callOptions = buildBrainCallOptions({
      hasAccessibleUploads,
      userPermissionLevel,
      conversationId,
      channelId,
      channelName,
      interfaceType,
      hasPriorResponseCandidate:
        uploadContinuity.priorResponseRef !== undefined,
      ...(agentContextInstructions ? { agentContextInstructions } : {}),
    });

    const result = await this.deps.getAgent().generate({
      messages,
      options: callOptions,
    });

    const { toolResults, pendingConfirmations, cards, totalToolCalls } =
      extractToolResults(result.steps);
    const sourcesCard = buildSourcesCardFromContextItems(contextItems);
    const responseCards = sourcesCard ? [...cards, sourcesCard] : cards;

    const responseText =
      pendingConfirmations.length > 0
        ? "Confirmation required."
        : result.text.trim().length > 0
          ? result.text
          : (buildToolResultPromptFallback(toolResults) ?? result.text);
    const entityMemoryRefs =
      pendingConfirmations.length > 0 ? [] : buildEntityMemoryRefs(toolResults);
    const agentContactCandidates =
      pendingConfirmations.length > 0
        ? []
        : buildAgentContactCandidates(toolResults);

    // Save assistant response. When a tool requires confirmation, do not save
    // potentially misleading model completion text (e.g. "Deleted.") before
    // the action has actually been confirmed and executed.
    //
    // Store structured refs for entities this turn created/updated so their IDs
    // stay addressable next turn. These refs are injected into model history
    // from metadata only; visible assistant content stays clean.
    if (responseText.trim()) {
      await this.deps.conversationService.addMessage({
        conversationId,
        role: "assistant",
        content: responseText,
        ...this.messageMetadata({
          actor: this.getAssistantActor(),
          source: this.buildAssistantSource(channelId, channelName),
          cards: responseCards,
          entityMemoryRefs,
          agentContactCandidates,
        }),
      });
    }

    this.deps.logger.debug("Chat completed", {
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

  public async executeConfirmedAction(
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
      this.deps.mcpService.listToolsForPermissionLevel(userPermissionLevel);
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
      ...(channelId ? { channelId } : {}),
      channelName,
      userPermissionLevel,
    };

    const result = await tool.tool.handler(pendingConfirmation.args, context);
    const outcome = buildConfirmedActionResult(pendingConfirmation, result);
    const failed = outcome.cards.some(
      (card) => card.kind === "tool-approval" && card.state === "output-error",
    );
    const response = failed
      ? undefined
      : await this.generatePostConfirmationFollowUp({
          conversationId,
          resultText: outcome.resultText,
          interfaceType,
          channelId,
          channelName,
          userPermissionLevel,
        });
    const fallbackText = buildAsyncGenerationFallback(outcome.toolResult.data);
    const responseText = response?.text.trim()
      ? `${outcome.resultText}\n\n${response.text}`
      : fallbackText
        ? `${outcome.resultText}\n\n${fallbackText}`
        : outcome.resultText;
    const cards = [...outcome.cards, ...(response?.cards ?? [])];
    const toolResults = [outcome.toolResult, ...(response?.toolResults ?? [])];
    const followUpEntityMemoryRefs = response
      ? buildEntityMemoryRefs(response.toolResults ?? [])
      : [];
    const entityMemoryRefs = [
      ...outcome.entityMemoryRefs,
      ...followUpEntityMemoryRefs,
    ];

    await this.deps.conversationService.addMessage({
      conversationId,
      role: "assistant",
      content: responseText,
      ...this.messageMetadata({
        actor: this.getAssistantActor(),
        source: this.buildAssistantSource(channelId, channelName),
        cards,
        entityMemoryRefs,
      }),
    });

    return {
      text: responseText,
      toolResults,
      cards,
      ...(response?.pendingConfirmations
        ? { pendingConfirmations: response.pendingConfirmations }
        : {}),
      usage: response?.usage ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  private async fetchAgentContext(params: {
    conversationId: string;
    message: string;
    interfaceType: string;
    channelId: string | undefined;
    channelName: string;
    userPermissionLevel: ChatContext["userPermissionLevel"];
  }): Promise<AgentContextItem[] | undefined> {
    if (!this.deps.agentContextProvider) return undefined;

    try {
      return await this.deps.agentContextProvider({
        conversationId: params.conversationId,
        message: params.message,
        interfaceType: params.interfaceType,
        channelId: params.channelId,
        channelName: params.channelName,
        userPermissionLevel: params.userPermissionLevel ?? "public",
      });
    } catch (error) {
      this.deps.logger.warn("Agent context provider failed", {
        conversationId: params.conversationId,
        error: getErrorMessage(error),
      });
      return undefined;
    }
  }

  private async generatePostConfirmationFollowUp(params: {
    conversationId: string;
    resultText: string;
    interfaceType: string;
    channelId: string | undefined;
    channelName: string;
    userPermissionLevel: NonNullable<ChatContext["userPermissionLevel"]>;
  }): Promise<AgentResponse | undefined> {
    if (!this.deps.agentContextProvider) return undefined;

    const followUpPrompt = `The operator approved the pending action. The system executed it successfully: ${params.resultText} Continue the conversation naturally. If an active playbook is underway, use the current playbook context as the source of truth, ask only for what is missing in the current playbook state, and give the next immediate action or question. Do not skip ahead or imply uncompleted playbook steps are done. Do not ask for the same confirmation again. Do not suggest repeating the same collection, save, or create task unless the current playbook context explicitly asks for another item. If the approved action saved, created, or updated an item for a completed playbook collection step, do not ask for another item; follow the refreshed current state instead. Do not offer a completed prior-state task as an alternative to the current playbook task. Do not say you found, retrieved, or showed an entity unless the approved action or latest tool result actually performed retrieval or display; after a save or update, say it was saved or updated.`;
    const contextItems = await this.fetchAgentContext({
      conversationId: params.conversationId,
      message: followUpPrompt,
      interfaceType: params.interfaceType,
      channelId: params.channelId,
      channelName: params.channelName,
      userPermissionLevel: params.userPermissionLevel,
    });
    if (!contextItems || contextItems.length === 0) return undefined;

    const historyMessages = await this.deps.conversationService.getMessages(
      params.conversationId,
      { limit: 50 },
    );
    const messages = buildModelMessages(historyMessages, followUpPrompt);
    const agentContextInstructions =
      buildAgentContextInstructions(contextItems);
    const result = await this.deps.getAgent().generate({
      messages,
      options: {
        userPermissionLevel: params.userPermissionLevel,
        conversationId: params.conversationId,
        ...(params.channelId ? { channelId: params.channelId } : {}),
        channelName: params.channelName,
        interfaceType: params.interfaceType,
        ...(agentContextInstructions ? { agentContextInstructions } : {}),
        disableTools: true,
      },
    });

    const { toolResults, pendingConfirmations, cards } = extractToolResults(
      result.steps,
    );
    return {
      text:
        pendingConfirmations.length > 0
          ? "Confirmation required."
          : result.text,
      toolResults,
      ...(cards.length > 0 ? { cards } : {}),
      ...(pendingConfirmations.length > 0 ? { pendingConfirmations } : {}),
      usage: toTokenUsage(result.usage),
    };
  }

  private messageMetadata(params: {
    actor: ConversationMessageActor | null;
    source: ConversationMessageSource | null;
    attachments?: ChatAttachment[];
    cards?: StructuredChatCard[];
    entityMemoryRefs?: EntityMemoryRef[];
    agentContactCandidates?: AgentContactCandidate[];
  }): { metadata: Record<string, unknown> } | Record<string, never> {
    return withMessageMetadata(
      buildMessageMetadata({
        ...params,
        ...(this.deps.canonicalIdentityResolver
          ? { canonicalIdentityResolver: this.deps.canonicalIdentityResolver }
          : {}),
      }),
    );
  }

  private getAssistantActor(): ConversationMessageActor {
    return buildAssistantActor({
      character: this.deps.identityService.getCharacter(),
      ...(this.deps.assistantActorId
        ? { actorId: this.deps.assistantActorId }
        : {}),
    });
  }

  private buildAssistantSource(
    channelId: string | undefined,
    channelName: string,
  ): ConversationMessageSource {
    return {
      ...(channelId ? { channelId } : {}),
      channelName,
    };
  }
}
