import { setup, assign, fromPromise } from "xstate";
import type { UserPermissionLevel } from "@brains/templates";
import type {
  ConversationMessageActor,
  ConversationMessageSource,
} from "@brains/conversation-service";
import type { AgentResponse, PendingConfirmation } from "./agent-types";

/**
 * Context for the agent state machine.
 * All fields are required (no optionals) to avoid exactOptionalPropertyTypes issues.
 */
export interface AgentMachineContext {
  conversationId: string;
  message: string;
  interfaceType: string;
  channelId: string;
  channelName: string;
  userPermissionLevel: UserPermissionLevel;
  actor: ConversationMessageActor | null;
  source: ConversationMessageSource | null;
  response: AgentResponse | null;
  pendingConfirmation: PendingConfirmation | null;
  pendingConfirmations: PendingConfirmation[];
  activeConfirmation: PendingConfirmation | null;
  error: string | null;
}

/**
 * Events that the agent machine can receive
 */
export type AgentMachineEvent =
  | {
      type: "RECEIVE_MESSAGE";
      message: string;
      conversationId: string;
      interfaceType: string;
      channelId: string;
      channelName: string;
      userPermissionLevel: UserPermissionLevel;
      actor: ConversationMessageActor | null;
      source: ConversationMessageSource | null;
    }
  | { type: "CONFIRM"; approvalId?: string }
  | { type: "CANCEL"; approvalId?: string };

/**
 * Input for the processMessage actor
 */
export interface ProcessMessageInput {
  conversationId: string;
  message: string;
  interfaceType: string;
  channelId: string;
  channelName: string;
  userPermissionLevel: UserPermissionLevel;
  actor: ConversationMessageActor | null;
  source: ConversationMessageSource | null;
}

/**
 * Input for the executeConfirmedAction actor
 */
export interface ExecuteActionInput {
  conversationId: string;
  pendingConfirmation: PendingConfirmation;
  interfaceType: string;
  channelId: string;
  channelName: string;
  userPermissionLevel: UserPermissionLevel;
}

export const emptyUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstPending(
  pendingConfirmations: PendingConfirmation[],
): PendingConfirmation | null {
  return pendingConfirmations[0] ?? null;
}

function getPendingConfirmations(
  response: AgentResponse,
): PendingConfirmation[] {
  if (response.pendingConfirmations) return response.pendingConfirmations;
  return response.pendingConfirmation ? [response.pendingConfirmation] : [];
}

function findPendingConfirmation(
  context: AgentMachineContext,
  approvalId: string | undefined,
): PendingConfirmation | null {
  if (approvalId) {
    return (
      context.pendingConfirmations.find(
        (confirmation) => confirmation.id === approvalId,
      ) ?? null
    );
  }
  return context.pendingConfirmation;
}

function remainingPendingConfirmations(
  context: AgentMachineContext,
  approvalId: string | undefined,
): PendingConfirmation[] {
  const selected = findPendingConfirmation(context, approvalId);
  if (!selected) return context.pendingConfirmations;
  return context.pendingConfirmations.filter(
    (confirmation) => confirmation.id !== selected.id,
  );
}

function hasRemainingPendingConfirmations({
  context,
  event,
}: {
  context: AgentMachineContext;
  event: AgentMachineEvent;
}): boolean {
  if (event.type !== "CONFIRM" && event.type !== "CANCEL") return false;
  return remainingPendingConfirmations(context, event.approvalId).length > 0;
}

function buildCancelledResponse(
  confirmation: PendingConfirmation | null,
): AgentResponse {
  const summary = confirmation?.summary ?? "unknown action";
  return {
    text: `Action cancelled: ${summary}`,
    ...(confirmation
      ? {
          cards: [
            {
              kind: "tool-approval",
              id: confirmation.id,
              ...(confirmation.toolCallId
                ? { toolCallId: confirmation.toolCallId }
                : {}),
              toolName: confirmation.toolName,
              ...(isRecord(confirmation.args)
                ? { input: confirmation.args }
                : {}),
              summary,
              state: "output-denied",
            },
          ],
        }
      : {}),
    usage: emptyUsage,
  };
}

/**
 * Create the agent state machine.
 *
 * The machine delegates actual work to injected actors:
 * - processMessage: handles chat flow (load history → call agent → save response)
 * - executeConfirmedAction: runs a confirmed destructive tool
 *
 * This keeps the machine pure — all side effects live in the actors.
 */
export const agentMachine = setup({
  types: {
    context: {} as AgentMachineContext,
    events: {} as AgentMachineEvent,
  },
  actors: {
    processMessage: fromPromise<AgentResponse, ProcessMessageInput>(
      async () => {
        throw new Error("processMessage actor not provided");
      },
    ),
    executeConfirmedAction: fromPromise<AgentResponse, ExecuteActionInput>(
      async () => {
        throw new Error("executeConfirmedAction actor not provided");
      },
    ),
  },
}).createMachine({
  id: "agent",
  initial: "idle",
  context: {
    conversationId: "",
    message: "",
    interfaceType: "agent",
    channelId: "",
    channelName: "",
    userPermissionLevel: "public" as UserPermissionLevel,
    actor: null,
    source: null,
    response: null,
    pendingConfirmation: null,
    pendingConfirmations: [],
    activeConfirmation: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        RECEIVE_MESSAGE: {
          target: "processing",
          actions: assign(({ event }) => ({
            message: event.message,
            conversationId: event.conversationId,
            interfaceType: event.interfaceType,
            channelId: event.channelId,
            channelName: event.channelName,
            userPermissionLevel: event.userPermissionLevel,
            actor: event.actor,
            source: event.source,
            response: null,
            pendingConfirmation: null,
            pendingConfirmations: [],
            activeConfirmation: null,
            error: null,
          })),
        },
      },
    },

    processing: {
      invoke: {
        src: "processMessage",
        input: ({ context }) => ({
          conversationId: context.conversationId,
          message: context.message,
          interfaceType: context.interfaceType,
          channelId: context.channelId,
          channelName: context.channelName,
          userPermissionLevel: context.userPermissionLevel,
          actor: context.actor,
          source: context.source,
        }),
        onDone: [
          {
            guard: ({ event }): boolean =>
              getPendingConfirmations(event.output).length > 0,
            target: "awaitingConfirmation",
            actions: assign(({ event }) => {
              const pendingConfirmations = getPendingConfirmations(
                event.output,
              );
              return {
                response: event.output,
                pendingConfirmation: firstPending(pendingConfirmations),
                pendingConfirmations,
                activeConfirmation: null,
              };
            }),
          },
          {
            target: "idle",
            actions: assign(({ event }) => ({
              response: event.output,
            })),
          },
        ],
        onError: {
          target: "idle",
          actions: assign(({ event }) => ({
            error:
              event.error instanceof Error
                ? event.error.message
                : "Unknown error",
            response: {
              text:
                event.error instanceof Error
                  ? `Error: ${event.error.message}`
                  : "An unexpected error occurred.",
              usage: emptyUsage,
            },
          })),
        },
      },
    },

    awaitingConfirmation: {
      on: {
        CONFIRM: {
          target: "executing",
          actions: assign(({ context, event }) => {
            const activeConfirmation = findPendingConfirmation(
              context,
              event.approvalId,
            );
            const pendingConfirmations = remainingPendingConfirmations(
              context,
              event.approvalId,
            );
            return {
              activeConfirmation,
              pendingConfirmations,
              pendingConfirmation: firstPending(pendingConfirmations),
            };
          }),
        },
        CANCEL: [
          {
            guard: hasRemainingPendingConfirmations,
            target: "awaitingConfirmation",
            actions: assign(({ context, event }) => {
              const selected = findPendingConfirmation(
                context,
                event.approvalId,
              );
              const pendingConfirmations = remainingPendingConfirmations(
                context,
                event.approvalId,
              );
              return {
                response: buildCancelledResponse(selected),
                pendingConfirmations,
                pendingConfirmation: firstPending(pendingConfirmations),
                activeConfirmation: null,
              };
            }),
          },
          {
            target: "idle",
            actions: assign(({ context, event }) => {
              const selected = findPendingConfirmation(
                context,
                event.approvalId,
              );
              return {
                response: buildCancelledResponse(selected),
                pendingConfirmations: [],
                pendingConfirmation: null,
                activeConfirmation: null,
              };
            }),
          },
        ],
      },
    },

    executing: {
      invoke: {
        src: "executeConfirmedAction",
        input: ({ context }): ExecuteActionInput => {
          if (!context.activeConfirmation) {
            throw new Error("No pending confirmation in executing state");
          }
          return {
            conversationId: context.conversationId,
            pendingConfirmation: context.activeConfirmation,
            interfaceType: context.interfaceType,
            channelId: context.channelId,
            channelName: context.channelName,
            userPermissionLevel: context.userPermissionLevel,
          };
        },
        onDone: [
          {
            guard: ({ context }): boolean =>
              context.pendingConfirmations.length > 0,
            target: "awaitingConfirmation",
            actions: assign(({ context, event }) => ({
              response: event.output,
              pendingConfirmation: firstPending(context.pendingConfirmations),
              activeConfirmation: null,
            })),
          },
          {
            target: "idle",
            actions: assign(({ event }) => ({
              response: event.output,
              pendingConfirmation: null,
              pendingConfirmations: [],
              activeConfirmation: null,
            })),
          },
        ],
        onError: [
          {
            guard: ({ context }): boolean =>
              context.pendingConfirmations.length > 0,
            target: "awaitingConfirmation",
            actions: assign(({ context, event }) => ({
              error:
                event.error instanceof Error
                  ? event.error.message
                  : "Unknown error",
              response: {
                text: `Error executing ${context.activeConfirmation?.toolName ?? "action"}: ${
                  event.error instanceof Error
                    ? event.error.message
                    : "Unknown error"
                }`,
                usage: emptyUsage,
              },
              pendingConfirmation: firstPending(context.pendingConfirmations),
              activeConfirmation: null,
            })),
          },
          {
            target: "idle",
            actions: assign(({ context, event }) => ({
              error:
                event.error instanceof Error
                  ? event.error.message
                  : "Unknown error",
              response: {
                text: `Error executing ${context.activeConfirmation?.toolName ?? "action"}: ${
                  event.error instanceof Error
                    ? event.error.message
                    : "Unknown error"
                }`,
                usage: emptyUsage,
              },
              pendingConfirmation: null,
              pendingConfirmations: [],
              activeConfirmation: null,
            })),
          },
        ],
      },
    },
  },
});
