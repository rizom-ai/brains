import { type Logger } from "@brains/utils/logger";
import { isRecord } from "@brains/utils/is-record";
import { guestInterfaceType } from "@brains/contracts/chat";
import {
  assertGuestPermission,
  guestBrainIdentity,
  isGuestToolAllowed,
  requireGuestExecutionPolicy,
} from "./guest-execution";
import type { AgentConversationStore } from "./turn-processor";
import { parseConfirmationResponse } from "@brains/utils/confirmation-response";
import type { IMCPService } from "@brains/mcp-service";
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
  get guestProfileAvailable(): boolean {
    return (
      this.agentFactory.guestProfileAvailable === true &&
      (!this.indexReadiness || this.indexReadiness.isIndexReady())
    );
  }

  private mcpService: IMCPService;
  private identityService: IBrainCharacterService;
  private profileService: IAnchorProfileService;
  private logger: Logger;
  private stepLimit: number;
  private agentFactory: AgentConfig["agentFactory"];
  private agentInstructions: AgentConfig["agentInstructions"];
  private indexReadiness: AgentConfig["indexReadiness"];
  private readonly conversationService: AgentConversationStore;

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
  private guestAgent: BrainAgent | null = null;

  public static createFresh(
    mcpService: IMCPService,
    conversationService: AgentConversationStore,
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
    conversationService: AgentConversationStore,
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
    this.indexReadiness = config.indexReadiness;
    this.turns = new TurnProcessor({
      logger: this.logger,
      conversationService,
      mcpService,
      identityService,
      getAgent: (interfaceType): BrainAgent => this.getAgent(interfaceType),
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
    this.confirmations = new ConfirmationCoordinator(
      this.conversationActors,
      (conversationId, response, context) =>
        this.turns.persistCancelledAction(conversationId, response, context),
    );
  }

  /**
   * The live per-conversation actor registry.
   *
   * Read-only in practice: callers observe actor lifetime and machine state
   * through `peek` and `size`. Exposed so lifecycle assertions and diagnostics
   * do not have to reach through the private field with `Reflect.get`, which
   * turns a rename into a runtime failure instead of a compile error.
   */
  public getConversationActors(): ConversationActorRegistry<ConversationActor> {
    return this.conversationActors;
  }

  /**
   * Get or create the BrainAgent instance
   * Lazy initialization allows tools to be registered after service creation
   */
  private getAgent(interfaceType: string): BrainAgent {
    if (interfaceType === guestInterfaceType) {
      this.guestAgent ??= this.agentFactory({
        identity: guestBrainIdentity,
        tools: this.mcpService
          .listAgentToolsForPermissionLevel("public")
          .map(({ tool }) => tool)
          .filter(isGuestToolAllowed),
        stepLimit: this.stepLimit,
        getToolsForPermission: () =>
          this.mcpService
            .listAgentToolsForPermissionLevel("public")
            .map(({ tool }) => tool)
            .filter(isGuestToolAllowed),
      });
      return this.guestAgent;
    }
    this.agent ??= this.agentFactory({
      identity: this.identityService.getCharacter(),
      profile: this.profileService.getProfile(),
      tools: this.mcpService
        .listAgentToolsForPermissionLevel("admin")
        .map((t) => t.tool),
      pluginInstructions: this.mcpService.getInstructions(),
      ...(this.agentInstructions && {
        agentInstructions: this.agentInstructions,
      }),
      stepLimit: this.stepLimit,
      getToolsForPermission: (level) =>
        this.mcpService
          .listAgentToolsForPermissionLevel(level)
          .map((t) => t.tool),
    });
    return this.agent;
  }

  /**
   * Invalidate the cached agent
   * Call this when tools are registered/unregistered
   */
  public invalidateAgent(): void {
    this.agent = null;
    this.guestAgent = null;
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
    const guest = interfaceType === guestInterfaceType;
    assertGuestPermission({
      interfaceType,
      userPermissionLevel,
      isAnchor: context?.isAnchor ?? false,
    });
    if (
      guest &&
      (context?.actor || context?.source || context?.attachments?.length)
    ) {
      throw new Error("Guest execution denied");
    }
    const guestExecution = requireGuestExecutionPolicy({
      interfaceType,
      guestExecution: context?.guestExecution,
    });
    if (guestExecution) {
      if (
        !message.trim() ||
        message.length > guestExecution.limits.messageCharacters
      )
        throw new Error("Guest input limit exceeded");
      const deadline = AbortSignal.timeout(
        guestExecution.limits.requestTimeoutSeconds * 1000,
      );
      signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    }
    const conversation =
      await this.conversationService.getConversation(conversationId);
    if (
      (guest &&
        (conversation?.interfaceType !== guestInterfaceType ||
          conversation.personId)) ||
      (!guest && conversation?.interfaceType === guestInterfaceType)
    ) {
      throw new Error("Guest conversation unavailable");
    }

    if (!guest)
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
          if (guest) throw new Error("Guest execution denied");
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
          ...(guestExecution ? { guestExecution } : {}),
          signal: operationSignal,
        });

        const snapshot = await waitFor(
          actor,
          (s) => s.matches("idle") || s.matches("awaitingConfirmation"),
        );
        operationSignal.throwIfAborted();
        if (guestExecution && snapshot.context.error)
          throw new Error("Guest execution unavailable");

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
    if (
      (isRecord(context) && context["interfaceType"] === guestInterfaceType) ||
      (await this.conversationService.getConversation(conversationId))
        ?.interfaceType === guestInterfaceType
    ) {
      throw new Error("Guest execution denied");
    }
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
