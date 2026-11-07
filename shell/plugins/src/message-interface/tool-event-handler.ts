import {
  toolCompletedChannel,
  toolFailedChannel,
  toolInvokingChannel,
  type TOOL_EVENT_CHANNELS,
  type ToolCompletionEvent,
  type ToolFailureEvent,
  type ToolInvocationEvent,
} from "@brains/ai-service";
import type { InterfacePluginContext } from "../interface/context";

export type ToolActivityEventType =
  (typeof TOOL_EVENT_CHANNELS)[keyof typeof TOOL_EVENT_CHANNELS];

/** What an interface shows of a tool event: which tool, where, and how it ended. */
export interface ToolActivityEvent
  extends
    Pick<
      ToolFailureEvent,
      | "toolName"
      | "conversationId"
      | "interfaceType"
      | "channelId"
      | "channelName"
      | "toolCallId"
    >,
    Partial<Pick<ToolFailureEvent, "error">> {
  type: ToolActivityEventType;
}

export interface ToolActivityHandlers {
  onToolActivity: (event: ToolActivityEvent) => Promise<void>;
  onError: (error: unknown) => void;
}

function toActivity(
  type: ToolActivityEventType,
  event: ToolInvocationEvent | ToolCompletionEvent | ToolFailureEvent,
): ToolActivityEvent {
  return {
    type,
    toolName: event.toolName,
    conversationId: event.conversationId,
    interfaceType: event.interfaceType,
    channelId: event.channelId,
    channelName: event.channelName,
    toolCallId: event.toolCallId,
    ...("error" in event ? { error: event.error } : {}),
  };
}

/**
 * Follow the tool events through their channels, which refuse a malformed
 * event, and hand each valid one to the interface.
 */
export function setupToolActivityHandler(
  context: InterfacePluginContext,
  handlers: ToolActivityHandlers,
): void {
  const forward = async (
    event: ToolActivityEvent,
  ): Promise<{ success: boolean }> => {
    try {
      await handlers.onToolActivity(event);
      return { success: true };
    } catch (error) {
      handlers.onError(error);
      return { success: false };
    }
  };
  context.messaging.subscribe(toolInvokingChannel, (event) =>
    forward(toActivity(toolInvokingChannel.name, event)),
  );
  context.messaging.subscribe(toolCompletedChannel, (event) =>
    forward(toActivity(toolCompletedChannel.name, event)),
  );
  context.messaging.subscribe(toolFailedChannel, (event) =>
    forward(toActivity(toolFailedChannel.name, event)),
  );
}
