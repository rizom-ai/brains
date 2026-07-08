import type { UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { ExtensionMetadataSchema } from "./metadata";

export const MessageResponseSchema: z.ZodUnion<
  [
    z.ZodObject<{
      success: z.ZodBoolean;
      data: z.ZodOptional<z.ZodUnknown>;
      error: z.ZodOptional<z.ZodString>;
    }>,
    z.ZodObject<{ noop: z.ZodLiteral<true> }>,
  ]
> = z.union([
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

export const BaseMessageSchema: z.ZodObject<{
  id: z.ZodString;
  timestamp: z.ZodString;
  type: z.ZodString;
  source: z.ZodString;
  target: z.ZodOptional<z.ZodString>;
  metadata: z.ZodOptional<typeof ExtensionMetadataSchema>;
}> = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  source: z.string(),
  target: z.string().optional(),
  metadata: ExtensionMetadataSchema.optional(),
});

export type BaseMessage = z.output<typeof BaseMessageSchema>;

export type MessageWithPayload<T = unknown> = BaseMessage & {
  payload: T;
};

export interface MessageSendOptions {
  target?: string;
  metadata?: z.output<typeof ExtensionMetadataSchema>;
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
  userPermissionLevel?: UserPermissionLevel;
  threadId?: string;
}
