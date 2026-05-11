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
  | { type: "CONFIRM" }
  | { type: "CANCEL" };

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
            guard: ({ event }): boolean => !!event.output.pendingConfirmation,
            target: "awaitingConfirmation",
            actions: assign(({ event }) => ({
              response: event.output,
              pendingConfirmation: event.output.pendingConfirmation ?? null,
            })),
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
        },
        CANCEL: {
          target: "idle",
          actions: assign(({ context }) => ({
            response: {
              text: `Action cancelled: ${context.pendingConfirmation?.description ?? "unknown action"}`,
              usage: emptyUsage,
            },
            pendingConfirmation: null,
          })),
        },
      },
    },

    executing: {
      invoke: {
        src: "executeConfirmedAction",
        input: ({ context }): ExecuteActionInput => {
          if (!context.pendingConfirmation) {
            throw new Error("No pending confirmation in executing state");
          }
          return {
            conversationId: context.conversationId,
            pendingConfirmation: context.pendingConfirmation,
            interfaceType: context.interfaceType,
            channelId: context.channelId,
            channelName: context.channelName,
            userPermissionLevel: context.userPermissionLevel,
          };
        },
        onDone: {
          target: "idle",
          actions: assign(({ event }) => ({
            response: event.output,
            pendingConfirmation: null,
          })),
        },
        onError: {
          target: "idle",
          actions: assign(({ context, event }) => ({
            error:
              event.error instanceof Error
                ? event.error.message
                : "Unknown error",
            response: {
              text: `Error executing ${context.pendingConfirmation?.toolName ?? "action"}: ${
                event.error instanceof Error
                  ? event.error.message
                  : "Unknown error"
              }`,
              usage: emptyUsage,
            },
            pendingConfirmation: null,
          })),
        },
      },
    },
  },
});
