import { z } from "@brains/utils/zod";
import type { InterfacePluginContext } from "../interface/context";

const toolActivityEventTypeSchema = z.enum([
  "tool:invoking",
  "tool:completed",
  "tool:failed",
]);

const toolActivityPayloadSchema = z.object({
  toolName: z.string().min(1),
  conversationId: z.string().min(1),
  interfaceType: z.string().min(1),
  channelId: z.string().min(1).optional(),
  channelName: z.string().min(1).optional(),
  toolCallId: z.string().min(1).optional(),
  error: z.string().optional(),
});

export type ToolActivityEventType =
  "tool:invoking" | "tool:completed" | "tool:failed";

export interface ToolActivityEvent {
  type: ToolActivityEventType;
  toolName: string;
  conversationId: string;
  interfaceType: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  error?: string | undefined;
}

export interface ToolActivityHandlers {
  onToolActivity: (event: ToolActivityEvent) => Promise<void>;
  onError: (error: unknown) => void;
  onInvalidSchema: () => void;
}

const toolActivityEventTypes: ToolActivityEventType[] = [
  "tool:invoking",
  "tool:completed",
  "tool:failed",
];

export function setupToolActivityHandler(
  context: InterfacePluginContext,
  handlers: ToolActivityHandlers,
): void {
  for (const type of toolActivityEventTypes) {
    context.messaging.subscribe(type, async (message) => {
      try {
        const parsedType = toolActivityEventTypeSchema.safeParse(message.type);
        const parsedPayload = toolActivityPayloadSchema.safeParse(
          message.payload,
        );
        if (!parsedType.success || !parsedPayload.success) {
          handlers.onInvalidSchema();
          return { success: false };
        }

        await handlers.onToolActivity({
          type: parsedType.data,
          ...parsedPayload.data,
        });
        return { success: true };
      } catch (error) {
        handlers.onError(error);
        return { success: false };
      }
    });
  }
}
