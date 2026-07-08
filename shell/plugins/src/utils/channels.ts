import { z } from "@brains/utils/zod";

/**
 * Schema for validating Channel objects
 */
const channelParserSchema = z.custom<ChannelSchema<unknown>>(
  (value) =>
    typeof value === "object" && value !== null && "safeParse" in value,
);

const channelSchema = z.object({
  name: z.string(),
  schema: channelParserSchema,
});

/**
 * A typed message channel definition
 *
 * Channels provide type-safe message passing between plugins.
 * When subscribing with a Channel, the payload is automatically
 * validated against the schema and typed.
 *
 * @example
 * ```typescript
 * // Define a channel
 * const EntityCreatedChannel = defineChannel(
 *   "entity:created",
 *   z.object({ entityId: z.string(), entityType: z.string() })
 * );
 *
 * // Subscribe with automatic validation
 * context.messaging.subscribe(EntityCreatedChannel, async (payload) => {
 *   // payload is typed as { entityId: string, entityType: string }
 *   console.log(`Created: ${payload.entityId}`);
 *   return { success: true };
 * });
 *
 * // Send with type checking
 * context.messaging.send({
 *   type: EntityCreatedChannel.name,
 *   payload: {
 *     entityId: "123",
 *     entityType: "note"
 *   }
 * });
 * ```
 */
export interface ChannelSchema<TPayload> {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: TPayload }
    | { success: false; error: { message: string } };
}

export interface Channel<TPayload, TResponse = unknown> {
  /** Channel name/identifier */
  readonly name: string;

  /** Schema for validating payloads */
  readonly schema: ChannelSchema<TPayload>;

  /** Type marker for response (not used at runtime) */
  readonly _response?: TResponse;
}

/**
 * Define a typed message channel
 *
 * @param name - Unique channel identifier
 * @param schema - Zod schema for payload validation
 * @returns A typed Channel object
 *
 * @example
 * ```typescript
 * const JobProgressChannel = defineChannel(
 *   "job-progress",
 *   z.object({
 *     jobId: z.string(),
 *     status: z.enum(["pending", "processing", "completed", "failed"]),
 *     progress: z.number().optional(),
 *   })
 * );
 * ```
 */
export function defineChannel<TPayload, TResponse = unknown>(
  name: string,
  schema: ChannelSchema<TPayload>,
): Channel<TPayload, TResponse> {
  return {
    name,
    schema,
  };
}

/**
 * Type guard to check if something is a Channel
 */
export function isChannel<T, R>(
  value: string | Channel<T, R>,
): value is Channel<T, R> {
  return channelSchema.safeParse(value).success;
}
