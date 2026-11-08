import {
  actorRefSchema,
  defineChannel,
  type ActorRef,
  type Channel,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { definedFields } from "@brains/utils/strip-undefined";
import { z } from "@brains/utils/zod";
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
  actor?: ActorRef | undefined;
  displayName?: string | undefined;
}

/** The tool events every interface showing tool activity follows. */
export const TOOL_EVENT_CHANNELS = {
  invoking: "tool:invoking",
  completed: "tool:completed",
  failed: "tool:failed",
} as const;

type ToolCompletionEventSchema = z.ZodObject<{
  toolName: z.ZodString;
  conversationId: z.ZodString;
  interfaceType: z.ZodString;
  actor: typeof actorRefSchema;
  displayName: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  toolCallId: z.ZodOptional<z.ZodString>;
}>;

/**
 * A tool returned: the tool, who called it, and the conversation its events
 * are routed to. The other tool events carry the same.
 */
export const toolCompletionEventSchema: ToolCompletionEventSchema = z.object({
  toolName: z.string().min(1),
  conversationId: z.string().min(1),
  interfaceType: z.string().min(1),
  actor: actorRefSchema,
  displayName: z.string().optional(),
  channelId: z.string().min(1).optional(),
  channelName: z.string().min(1).optional(),
  toolCallId: z.string().min(1).optional(),
});

export type ToolCompletionEvent = z.output<typeof toolCompletionEventSchema>;

type ToolInvocationEventSchema = ReturnType<
  typeof toolCompletionEventSchema.extend<{ args: z.ZodOptional<z.ZodUnknown> }>
>;

/** A tool is starting, with the arguments it was called with. */
export const toolInvocationEventSchema: ToolInvocationEventSchema =
  toolCompletionEventSchema.extend({ args: z.unknown().optional() });

export type ToolInvocationEvent = z.output<typeof toolInvocationEventSchema>;

type ToolFailureEventSchema = ReturnType<
  typeof toolCompletionEventSchema.extend<{ error: z.ZodString }>
>;

/** A tool threw, with the message it threw. */
export const toolFailureEventSchema: ToolFailureEventSchema =
  toolCompletionEventSchema.extend({ error: z.string() });

export type ToolFailureEvent = z.output<typeof toolFailureEventSchema>;

export const toolInvokingChannel: Channel<
  ToolInvocationEvent,
  unknown,
  typeof TOOL_EVENT_CHANNELS.invoking
> = defineChannel(TOOL_EVENT_CHANNELS.invoking, toolInvocationEventSchema);

export const toolCompletedChannel: Channel<
  ToolCompletionEvent,
  unknown,
  typeof TOOL_EVENT_CHANNELS.completed
> = defineChannel(TOOL_EVENT_CHANNELS.completed, toolCompletionEventSchema);

export const toolFailedChannel: Channel<
  ToolFailureEvent,
  unknown,
  typeof TOOL_EVENT_CHANNELS.failed
> = defineChannel(TOOL_EVENT_CHANNELS.failed, toolFailureEventSchema);

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
  abortSignal?: AbortSignal | undefined;
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
  const actor: ActorRef = contextInfo.actor ?? {
    kind: "agent",
    agentId: "brain-agent",
  };
  // Routing context shared by every event this wrapper emits
  const eventContext = {
    conversationId: contextInfo.conversationId,
    interfaceType: contextInfo.interfaceType,
    actor,
    ...definedFields({
      displayName: contextInfo.displayName,
      channelId: contextInfo.channelId,
      channelName: contextInfo.channelName,
    }),
  };
  return async (
    args: unknown,
    options?: ToolExecutionOptionsLike,
  ): Promise<unknown> => {
    const context = {
      ...eventContext,
      ...definedFields({ toolCallId: options?.toolCallId }),
    };

    // Emit tool:invoking event
    if (emitter) {
      const invokingPayload: ToolInvocationEvent = {
        toolName,
        args,
        ...context,
      };
      await emitter.emit(toolInvokingChannel.name, invokingPayload);
    }

    try {
      // Execute the original handler
      const result = options
        ? await handler(args, options)
        : await handler(args);

      // Emit tool:completed event
      if (emitter) {
        const completedPayload: ToolCompletionEvent = { toolName, ...context };
        await emitter.emit(toolCompletedChannel.name, completedPayload);
      }

      return result;
    } catch (error) {
      // Emit tool:failed event
      if (emitter) {
        const failedPayload: ToolFailureEvent = {
          toolName,
          error: getErrorMessage(error),
          ...context,
        };
        await emitter.emit(toolFailedChannel.name, failedPayload);
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
