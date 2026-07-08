/**
 * Confirmation Coordinator
 *
 * Resolution of approval-gated pending actions: who may confirm a
 * pending confirmation, how caller context is reconciled with the
 * machine's, and driving the machine through CONFIRM/CANCEL until the
 * confirmation leaves the pending set.
 *
 * Callers are responsible for routing through the per-conversation
 * serialized queue; this module assumes it already holds the slot.
 */

import { waitFor, type createActor } from "xstate";
import { PermissionService } from "@brains/templates";
import type {
  ConversationMessageActor,
  ConversationMessageSource,
} from "@brains/conversation-service";
import {
  emptyUsage,
  type agentMachine,
  type AgentMachineContext,
  type RuntimePendingConfirmation,
} from "./agent-machine";
import type { AgentResponse, ChatContext } from "./agent-types";

type ConversationActor = ReturnType<typeof createActor<typeof agentMachine>>;

export interface ConfirmationContext {
  interfaceType: string;
  channelId: string | undefined;
  channelName: string;
  userPermissionLevel: NonNullable<ChatContext["userPermissionLevel"]>;
  actor: ConversationMessageActor | null;
  source: ConversationMessageSource | null;
}

function actorKey(
  actor: ConversationMessageActor | null | undefined,
): string | undefined {
  return actor?.canonicalId ?? actor?.actorId;
}

/**
 * Whether the caller may resolve this pending confirmation: the anchor
 * always may; otherwise the caller must be the pinned requester (when
 * one is recorded) and meet the requester's permission level.
 */
export function canConfirmPendingAction(
  pendingConfirmation: RuntimePendingConfirmation,
  context: {
    userPermissionLevel: NonNullable<ChatContext["userPermissionLevel"]>;
    actor: ConversationMessageActor | null;
  },
): boolean {
  if (context.userPermissionLevel === "anchor") return true;

  const requesterActorKey = pendingConfirmation.requester.actorKey;
  if (requesterActorKey) {
    const callerActorKey = actorKey(context.actor);
    if (callerActorKey !== requesterActorKey) return false;
  }

  return PermissionService.hasPermission(
    context.userPermissionLevel,
    pendingConfirmation.requester.userPermissionLevel,
  );
}

/**
 * Build the confirmation context for a caller, filling transport fields
 * from the machine's previous context. Returns null when the caller did
 * not state its permission level.
 */
export function resolveConfirmationContext(
  context: ChatContext | undefined,
  previousContext: AgentMachineContext,
): ConfirmationContext | null {
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

export class ConfirmationCoordinator {
  private readonly actors: {
    peek(conversationId: string): ConversationActor | undefined;
    scheduleEviction(conversationId: string): void;
  };

  constructor(actors: {
    peek(conversationId: string): ConversationActor | undefined;
    scheduleEviction(conversationId: string): void;
  }) {
    this.actors = actors;
  }

  /**
   * Confirm or cancel a pending action addressed by approval id,
   * validating existence, caller context, and authorization.
   */
  public async run(
    conversationId: string,
    confirmed: boolean,
    approvalId: string,
    context: ChatContext,
  ): Promise<AgentResponse> {
    const actor = this.actors.peek(conversationId);
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

    const confirmationContext = resolveConfirmationContext(
      context,
      snapshotBeforeConfirm.context,
    );
    if (!confirmationContext) {
      return {
        text: "Confirmation requires caller context.",
        usage: emptyUsage,
      };
    }

    if (!canConfirmPendingAction(pendingConfirmation, confirmationContext)) {
      return {
        text: "You are not authorized to confirm this pending action.",
        pendingConfirmations:
          snapshotBeforeConfirm.context.pendingConfirmations,
        usage: emptyUsage,
      };
    }

    return this.resolve(
      conversationId,
      actor,
      pendingConfirmation,
      confirmed,
      confirmationContext,
    );
  }

  /**
   * Drive the machine through CONFIRM/CANCEL and wait until this
   * confirmation has left the pending set.
   */
  public async resolve(
    conversationId: string,
    actor: ConversationActor,
    pendingConfirmation: RuntimePendingConfirmation,
    confirmed: boolean,
    confirmationContext: ConfirmationContext,
  ): Promise<AgentResponse> {
    try {
      actor.send({
        type: confirmed ? "CONFIRM" : "CANCEL",
        approvalId: pendingConfirmation.id,
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
            (confirmation) => confirmation.id === pendingConfirmation.id,
          ),
      );

      return (
        snapshot.context.response ?? {
          text: "Action completed.",
          usage: emptyUsage,
        }
      );
    } finally {
      this.actors.scheduleEviction(conversationId);
    }
  }
}
