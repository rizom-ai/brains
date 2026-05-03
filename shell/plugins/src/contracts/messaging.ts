import { z } from "zod";
import { ExtensionMetadataSchema } from "./metadata";

export const MessageResponseSchema = z.union([
  z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
  }),
  z.object({ noop: z.literal(true) }),
]);

export type MessageResponse<T = unknown> =
  | ({ success: boolean; error?: string | undefined } & {
      data?: T | undefined;
    })
  | { noop: true };

export const BaseMessageSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  source: z.string(),
  target: z.string().optional(),
  metadata: ExtensionMetadataSchema.optional(),
});

export type BaseMessage = z.infer<typeof BaseMessageSchema>;

export type MessageWithPayload<T = unknown> = BaseMessage & {
  payload: T;
};

export interface MessageSendOptions {
  target?: string;
  metadata?: z.infer<typeof ExtensionMetadataSchema>;
  broadcast?: boolean;
}

export interface MessageSendRequest<T = unknown> extends MessageSendOptions {
  type: string;
  payload: T;
}

export type MessageSender<T = unknown, R = unknown> = (
  request: MessageSendRequest<T>,
) => Promise<MessageResponse<R>>;

export interface MessageContext {
  userId?: string;
  channelId?: string;
  messageId?: string;
  timestamp?: string;
  interfaceType?: string;
  userPermissionLevel?: "public" | "trusted" | "anchor";
  threadId?: string;
}
