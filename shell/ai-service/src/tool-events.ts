import { getErrorMessage } from "@brains/utils";
/**
 * Tool Events - Event emission for tool invocations
 *
 * Provides a wrapper function that emits events before/after tool execution:
 * - tool:invoking - Before the tool handler is called
 * - tool:completed - After the tool handler returns successfully
 * - tool:failed - When the tool handler throws an error
 */

/**
 * Tool context info for routing events to the right interface
 */
export interface ToolContextInfo {
  conversationId: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  interfaceType: string;
}

/**
 * Tool invocation event payload
 * Emitted when a tool starts executing
 */
export interface ToolInvocationEvent extends ToolContextInfo {
  toolName: string;
  args?: unknown;
  toolCallId?: string | undefined;
}

/**
 * Tool completion event payload
 * Emitted when a tool finishes (success or failure)
 */
export interface ToolCompletionEvent extends ToolContextInfo {
  toolName: string;
  error?: string | undefined;
  toolCallId?: string | undefined;
}

/**
 * Simple event emitter interface
 * Can be backed by MessageBus or a simple callback for testing
 */
export interface ToolEventEmitter {
  emit(type: string, payload: unknown): Promise<void> | void;
}

/**
 * Tool handler function type
 */
interface ToolExecutionOptionsLike {
  toolCallId?: string | undefined;
}

type ToolHandler = (
  args: unknown,
  options?: ToolExecutionOptionsLike,
) => Promise<unknown>;

/**
 * Create a wrapper function that emits events around tool execution
 *
 * @param toolName - Name of the tool being wrapped
 * @param handler - The original tool handler function
 * @param contextInfo - Context info for routing events (conversationId, channelId, etc.)
 * @param emitter - Optional event emitter (if undefined, no events are emitted)
 * @returns Wrapped function that emits events before/after execution
 */
export function createToolExecuteWrapper(
  toolName: string,
  handler: ToolHandler,
  contextInfo: ToolContextInfo,
  emitter: ToolEventEmitter | undefined,
): ToolHandler {
  return async (
    args: unknown,
    options?: ToolExecutionOptionsLike,
  ): Promise<unknown> => {
    // Emit tool:invoking event
    if (emitter) {
      const invokingPayload: ToolInvocationEvent = {
        toolName,
        args,
        conversationId: contextInfo.conversationId,
        interfaceType: contextInfo.interfaceType,
        ...(contextInfo.channelId !== undefined && {
          channelId: contextInfo.channelId,
        }),
        ...(contextInfo.channelName !== undefined && {
          channelName: contextInfo.channelName,
        }),
        ...(options?.toolCallId !== undefined && {
          toolCallId: options.toolCallId,
        }),
      };
      await emitter.emit("tool:invoking", invokingPayload);
    }

    try {
      // Execute the original handler
      const result = options
        ? await handler(args, options)
        : await handler(args);

      // Emit tool:completed event
      if (emitter) {
        const completedPayload: ToolCompletionEvent = {
          toolName,
          conversationId: contextInfo.conversationId,
          interfaceType: contextInfo.interfaceType,
          ...(contextInfo.channelId !== undefined && {
            channelId: contextInfo.channelId,
          }),
          ...(contextInfo.channelName !== undefined && {
            channelName: contextInfo.channelName,
          }),
          ...(options?.toolCallId !== undefined && {
            toolCallId: options.toolCallId,
          }),
        };
        await emitter.emit("tool:completed", completedPayload);
      }

      return result;
    } catch (error) {
      // Emit tool:failed event
      if (emitter) {
        const failedPayload: ToolCompletionEvent = {
          toolName,
          error: getErrorMessage(error),
          conversationId: contextInfo.conversationId,
          interfaceType: contextInfo.interfaceType,
          ...(contextInfo.channelId !== undefined && {
            channelId: contextInfo.channelId,
          }),
          ...(contextInfo.channelName !== undefined && {
            channelName: contextInfo.channelName,
          }),
          ...(options?.toolCallId !== undefined && {
            toolCallId: options.toolCallId,
          }),
        };
        await emitter.emit("tool:failed", failedPayload);
      }

      // Re-throw the original error
      throw error;
    }
  };
}

/**
 * Create an event emitter backed by MessageBus
 *
 * @param messageBus - The message bus to send events to
 * @param sender - Sender identifier for messages (usually "brain-agent")
 * @returns ToolEventEmitter that sends to MessageBus
 */
export function createMessageBusEmitter(
  messageBus: {
    send: (request: {
      type: string;
      payload: unknown;
      sender: string;
      broadcast?: boolean;
    }) => Promise<unknown>;
  },
  sender: string = "brain-agent",
): ToolEventEmitter {
  return {
    emit: async (type: string, payload: unknown): Promise<void> => {
      await messageBus
        .send({ type, payload, sender, broadcast: true })
        .catch(() => undefined);
    },
  };
}
