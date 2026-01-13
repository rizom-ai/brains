import { z } from "@brains/utils";

/**
 * Schema for validating Channel objects
 */
const channelSchema = z.object({
  name: z.string(),
  schema: z.custom<z.ZodType>((val) => val instanceof z.ZodType),
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
 * context.messaging.send(EntityCreatedChannel, {
 *   entityId: "123",
 *   entityType: "note"
 * });
 * ```
 */
export interface Channel<TPayload, TResponse = unknown> {
  /** Channel name/identifier */
  readonly name: string;

  /** Zod schema for validating payloads */
  readonly schema: z.ZodType<TPayload>;

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
  schema: z.ZodType<TPayload>,
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
