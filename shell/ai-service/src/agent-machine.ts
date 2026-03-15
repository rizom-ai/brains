import { setup, assign, fromPromise } from "xstate";
import { z } from "@brains/utils";
import type { UserPermissionLevel } from "@brains/templates";
import {
  toolConfirmationSchema,
  toolResponseSchema,
} from "@brains/mcp-service";
import type {
  AgentResponse,
  BrainAgentResult,
  PendingConfirmation,
  ToolResultData,
} from "./agent-types";

const jobIdSchema = z.object({ jobId: z.string() }).passthrough();

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
}

/**
 * Input for the executeConfirmedAction actor
 */
export interface ExecuteActionInput {
  conversationId: string;
  pendingConfirmation: PendingConfirmation;
}

const emptyUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

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

/**
 * Result of extracting tool results from agent steps.
 * Includes both the tool results and any confirmation request found.
 */
export interface ExtractedResults {
  toolResults: ToolResultData[];
  pendingConfirmation: PendingConfirmation | null;
}

/**
 * Extract tool results and confirmation requests from agent generation steps.
 * Pure function — no side effects.
 *
 * If any tool returned a `needsConfirmation` response, it's surfaced
 * as `pendingConfirmation` so the machine can transition to awaitingConfirmation.
 */
export function extractToolResults(
  steps: BrainAgentResult["steps"],
): ExtractedResults {
  const toolResults: ToolResultData[] = [];
  let pendingConfirmation: PendingConfirmation | null = null;

  for (const step of steps) {
    const toolCallArgsMap = new Map<string, Record<string, unknown>>();
    for (const tc of step.toolCalls) {
      if (tc.toolCallId && typeof tc.input === "object" && tc.input !== null) {
        toolCallArgsMap.set(tc.toolCallId, tc.input as Record<string, unknown>);
      }
    }

    for (const tr of step.toolResults) {
      if (tr.output === null) continue;

      // Check for confirmation request first (separate from ToolResponse)
      const confirmationParsed = toolConfirmationSchema.safeParse(tr.output);
      if (confirmationParsed.success) {
        pendingConfirmation = {
          toolName: confirmationParsed.data.toolName,
          description: confirmationParsed.data.description,
          args: confirmationParsed.data.args,
        };
        continue;
      }

      // Parse as regular tool response
      const parsed = toolResponseSchema.safeParse(tr.output);
      if (!parsed.success) {
        toolResults.push({ toolName: tr.toolName });
        continue;
      }

      const args = tr.toolCallId
        ? toolCallArgsMap.get(tr.toolCallId)
        : undefined;

      const toolResult: ToolResultData = { toolName: tr.toolName };
      if (args !== undefined) {
        toolResult.args = args;
      }

      // Extract data and jobId from success responses
      if (parsed.data.success && parsed.data.data != null) {
        toolResult.data = parsed.data.data;
        const jobIdParsed = jobIdSchema.safeParse(parsed.data.data);
        if (jobIdParsed.success) {
          toolResult.jobId = jobIdParsed.data.jobId;
        }
      }

      toolResults.push(toolResult);
    }
  }

  return { toolResults, pendingConfirmation };
}
