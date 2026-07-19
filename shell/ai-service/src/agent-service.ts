import { type Logger } from "@brains/utils/logger";
import { parseConfirmationResponse } from "@brains/utils/confirmation-response";
import type { IMCPService } from "@brains/mcp-service";
import type { IConversationService } from "@brains/conversation-service";
import type {
  IBrainCharacterService,
  IAnchorProfileService,
} from "@brains/identity-service";
import type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  ChatContext,
  IAgentService,
} from "./agent-types";
import {
  agentMachine,
  emptyUsage,
  type ProcessMessageInput,
  type ExecuteActionInput,
} from "./agent-machine";
import { createActor, fromPromise, waitFor } from "xstate";
import { ConversationActorRegistry } from "./conversation-actor-registry";
import {
  ConfirmationCoordinator,
  canConfirmPendingAction,
} from "./confirmation-coordinator";
import { TurnProcessor } from "./turn-processor";
import { ActiveTurnSupervisor } from "./active-turn-supervisor";

/**
 * Default step limit if not specified
 */
const DEFAULT_STEP_LIMIT = 10;
const DEFAULT_CONVERSATION_ACTOR_IDLE_TTL_MS = 30 * 60 * 1000;

function combineAbortSignals(
  first: AbortSignal,
  second: AbortSignal | undefined,
): AbortSignal {
  return second ? AbortSignal.any([first, second]) : first;
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
  private identityService: IBrainCharacterService;
  private profileService: IAnchorProfileService;
  private static instance: AgentService | null = null;
  private logger: Logger;
  private stepLimit: number;
  private agentFactory: AgentConfig["agentFactory"];
  private agentInstructions: AgentConfig["agentInstructions"];
  private indexReadiness: AgentConfig["indexReadiness"];

  private readonly activeTurns = new ActiveTurnSupervisor();
  private shutdownPromise: Promise<void> | null = null;

  // Provided machine with injected actors (created once, reused per conversation)
  private providedMachine = agentMachine.provide({
    actors: {
      processMessage: fromPromise<AgentResponse, ProcessMessageInput>(
        async ({ input, signal }) =>
          this.activeTurns.run(
            (turnSignal) => this.turns.processMessage(input, turnSignal),
            combineAbortSignals(signal, input.signal),
          ),
      ),
      executeConfirmedAction: fromPromise<AgentResponse, ExecuteActionInput>(
        async ({ input, signal }) =>
          this.activeTurns.run(
            (turnSignal) =>
              this.turns.executeConfirmedAction(input, turnSignal),
            combineAbortSignals(signal, input.signal),
          ),
      ),
    },
  });

  // Per-conversation machine actors plus the serialized operation chains
  // that keep service callers from resolving against another turn's
  // machine state.
  private conversationActors: ConversationActorRegistry<ConversationActor>;
  private confirmations: ConfirmationCoordinator;
  private turns: TurnProcessor;

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
  public static resetInstance(): Promise<void> {
    const instance = AgentService.instance;
    AgentService.instance = null;
    return instance?.shutdown() ?? Promise.resolve();
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
    this.identityService = identityService;
    this.profileService = profileService;
    this.logger = logger.child("AgentService");
    this.stepLimit = config.stepLimit ?? DEFAULT_STEP_LIMIT;
    this.agentFactory = config.agentFactory;
    this.agentInstructions = config.agentInstructions;
    this.indexReadiness = config.indexReadiness;
    this.turns = new TurnProcessor({
      logger: this.logger,
      conversationService,
      mcpService,
      identityService,
      getAgent: (): BrainAgent => this.getAgent(),
      assistantAgentId: config.assistantAgentId,
      canonicalIdentityResolver: config.canonicalIdentityResolver,
      agentContextProvider: config.agentContextProvider,
      uploadAttachmentResolver: config.uploadAttachmentResolver,
    });
    this.conversationActors = new ConversationActorRegistry({
      createActor: (): ConversationActor => {
        const actor = createActor(this.providedMachine);
        actor.start();
        return actor;
      },
      isEvictable: (actor): boolean => actor.getSnapshot().matches("idle"),
      idleTtlMs:
        config.conversationActorIdleTtlMs ??
        DEFAULT_CONVERSATION_ACTOR_IDLE_TTL_MS,
    });
    this.confirmations = new ConfirmationCoordinator(this.conversationActors);
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
   * Send a message to the agent and get a response
   */
  public async chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    signal?.throwIfAborted();
    if (this.indexReadiness && !this.indexReadiness.isIndexReady()) {
      return {
        text: "I'm still getting the knowledge base ready. Please try again in a moment.",
        usage: emptyUsage,
      };
    }

    const userPermissionLevel = context?.userPermissionLevel ?? "public";
    const interfaceType = context?.interfaceType ?? "agent";
    const channelId = context?.channelId;
    const channelName = context?.channelName ?? channelId ?? conversationId;

    this.logger.debug("Processing chat message", {
      conversationId,
      messageLength: message.length,
      userPermissionLevel,
    });

    return this.conversationActors.enqueue(
      conversationId,
      async (operationSignal) => {
        operationSignal.throwIfAborted();
        const actor = this.conversationActors.acquire(conversationId);
        const currentSnapshot = actor.getSnapshot();

        if (currentSnapshot.matches("awaitingConfirmation")) {
          const confirmationContext = {
            interfaceType,
            channelId,
            channelName,
            userPermissionLevel,
            isAnchor: context?.isAnchor ?? false,
            actor: context?.actor ?? null,
            source: context?.source ?? null,
          };
          const pendingConfirmations =
            currentSnapshot.context.pendingConfirmations;
          const parsedConfirmation = parseConfirmationResponse(message);
          const authorizedConfirmations = pendingConfirmations.filter(
            (confirmation) =>
              canConfirmPendingAction(confirmation, confirmationContext),
          );

          if (parsedConfirmation) {
            const [confirmation] = authorizedConfirmations;
            if (authorizedConfirmations.length !== 1 || !confirmation) {
              return {
                text:
                  authorizedConfirmations.length === 0
                    ? "You are not authorized to confirm this pending action."
                    : "Multiple approvals are pending; include one approval id with yes or no/cancel.",
                pendingConfirmations,
                usage: emptyUsage,
              };
            }

            return this.confirmations.resolve(
              conversationId,
              actor,
              confirmation,
              parsedConfirmation.confirmed,
              confirmationContext,
              operationSignal,
            );
          }

          if (authorizedConfirmations.length > 0) {
            for (const confirmation of authorizedConfirmations) {
              await this.confirmations.resolve(
                conversationId,
                actor,
                confirmation,
                false,
                confirmationContext,
                operationSignal,
              );
            }
          } else {
            // A caller who is not authorized for any pending confirmation cannot
            // resolve it and must not implicitly decline someone else's action.
            // Return promptly so the serialized queue stays free for the actor
            // who can confirm; the pending action is left intact.
            return {
              text: "A pending action is awaiting confirmation. Please try again once it has been resolved.",
              pendingConfirmations,
              usage: emptyUsage,
            };
          }
        }

        actor.send({
          type: "RECEIVE_MESSAGE",
          message,
          conversationId,
          interfaceType,
          channelId,
          channelName,
          userPermissionLevel,
          isAnchor: context?.isAnchor ?? false,
          actor: context?.actor ?? null,
          source: context?.source ?? null,
          attachments: context?.attachments ?? [],
          signal: operationSignal,
        });

        const snapshot = await waitFor(
          actor,
          (s) => s.matches("idle") || s.matches("awaitingConfirmation"),
        );
        operationSignal.throwIfAborted();

        return (
          snapshot.context.response ?? {
            text: "No response generated.",
            usage: emptyUsage,
          }
        );
      },
      signal,
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
    signal?: AbortSignal,
  ): Promise<AgentResponse> {
    signal?.throwIfAborted();
    // Route through the serialized queue so confirmations cannot race an
    // in-flight chat() operation on the same conversation actor.
    return this.conversationActors.enqueue(
      conversationId,
      (operationSignal) =>
        this.confirmations.run(
          conversationId,
          confirmed,
          approvalId,
          context,
          operationSignal,
        ),
      signal,
    );
  }

  public shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownActiveTurns();
    return this.shutdownPromise;
  }

  private async shutdownActiveTurns(): Promise<void> {
    const reason = new Error("Agent service has been shut down");
    const results = await Promise.allSettled([
      this.conversationActors.close(reason),
      this.activeTurns.close(),
    ]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }
}
