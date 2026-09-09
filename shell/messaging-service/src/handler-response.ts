import { z } from "@brains/utils/zod";
import { type MessageResponse, messageResponseSchema } from "./base-types";

export type HandlerResponse = MessageResponse;

/** Distinguish an invalid envelope from an exception thrown by its handler. */
export class InvalidHandlerResponseError extends Error {
  readonly code = "invalid_response";
  constructor() {
    super("Invalid message response format");
  }
}

const handlerResponseSchema: z.ZodUnion<
  readonly [
    z.ZodObject<{ noop: z.ZodLiteral<true> }>,
    typeof messageResponseSchema,
  ]
> = z.union([z.object({ noop: z.literal(true) }), messageResponseSchema]);

/**
 * Validate unknown handler output before the bus converts it to an internal
 * response.
 */
export function parseHandlerResponse(result: unknown): HandlerResponse {
  const parsed = handlerResponseSchema.safeParse(result);
  if (!parsed.success) {
    throw new InvalidHandlerResponseError();
  }

  return parsed.data;
}
