import type { z } from "@brains/utils/zod";

export type SubscriptionPayloadSchema = z.ZodType<unknown, unknown>;

/**
 * A request a package answers on the message bus.
 *
 * Neither family owns this. An interface that delivered a message is the only
 * thing that can fetch it back, and a service that routes notifications is the
 * only thing that knows which transport to use — both are requests arriving on
 * a topic, not jobs, tools or checks.
 *
 * The payload schema is the boundary: the runtime validates before the handler
 * runs, so a malformed request is refused rather than reaching it.
 *
 * Named consumers: @brains/email, @brains/notifications.
 */
export interface SubscriptionDefinition<
  TPayloadSchema extends SubscriptionPayloadSchema = SubscriptionPayloadSchema,
> {
  readonly topic: string;
  readonly payload: TPayloadSchema;
  handle(context: {
    readonly payload: z.output<TPayloadSchema>;
  }): unknown | Promise<unknown>;
}

export type AnySubscriptionDefinition =
  SubscriptionDefinition<SubscriptionPayloadSchema>;
