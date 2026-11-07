import { z } from "@brains/utils/zod";

/** What a channel validates its payloads with: a Zod schema, or anything with its `safeParse`. */
export interface ChannelSchema<TPayload> {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: TPayload }
    | { success: false; error: { message: string } };
}

/**
 * A message channel declared once: its name and the schema every payload on
 * it passes. A subscription through the channel hands its handler the
 * validated payload and refuses a malformed one, so no subscriber casts or
 * parses the payload itself. The name is kept as its literal type, which lets
 * the messaging namespace tell an entity event's channel from any other.
 *
 * @example
 * ```typescript
 * context.messaging.subscribe(publishCompletedChannel, async (payload) => {
 *   // payload is validated and typed
 *   return { success: true };
 * });
 * ```
 */
export interface Channel<
  TPayload,
  TResponse = unknown,
  TName extends string = string,
> {
  readonly name: TName;
  readonly schema: ChannelSchema<TPayload>;
  /** Type marker for the handler's reply; never set at runtime. */
  readonly _response?: TResponse;
}

export function defineChannel<
  TPayload,
  TResponse = unknown,
  TName extends string = string,
>(
  name: TName,
  schema: ChannelSchema<TPayload>,
): Channel<TPayload, TResponse, TName> {
  return Object.freeze({ name, schema });
}

const channelShape = z.object({
  name: z.string(),
  schema: z.custom<ChannelSchema<unknown>>(
    (value) =>
      typeof value === "object" && value !== null && "safeParse" in value,
  ),
});

/** Whether a value is a channel (a bus contract is one too). */
export function isChannel<T, R>(value: unknown): value is Channel<T, R> {
  return channelShape.safeParse(value).success;
}
