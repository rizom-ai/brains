import { z } from "@brains/utils/zod";
import type { ExtensionMetadataSchema } from "./metadata";

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

// The bus's own schema, not a second one. The copy that stood here accepted
// an empty `id`, `type` or `source` that the bus rejects, so a plugin author
// validating against the published schema got a pass the runtime would not
// honour.
import type { BaseMessage } from "@brains/messaging-service";
export {
  baseMessageSchema as BaseMessageSchema,
  type BaseMessage,
} from "@brains/messaging-service";

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

/**
 * The context a message arrives with.
 *
 * Re-exported rather than restated. The copy that stood here declared every
 * field optional and `timestamp` as a string, while the bus delivers all of
 * them and a `Date` — a shape no value ever had, published to plugin authors
 * through `@rizom/brain/plugins`. `contract-fidelity.ts` now holds the
 * restatements in this file to what the services produce.
 */
export type { MessageContext } from "@brains/messaging-service";
